-- User-authorized permanent deletion replaces archive/restore behavior.
-- Payment deletion is the user-approved exception: retain financial evidence privately.
alter table public.featured_event_audit drop constraint featured_event_audit_event_id_fkey;
alter table public.featured_event_audit add constraint featured_event_audit_event_id_fkey foreign key(event_id) references public.featured_events(id) on delete cascade;

-- Object bytes must be removed through Storage API, never by deleting storage.objects SQL rows.
create table public.formation_cleanup(path text primary key, created_at timestamptz not null default now());
alter table public.formation_cleanup enable row level security;
revoke all on public.formation_cleanup from public,anon,authenticated;

create function public.purge_deleted_source() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 kind:=case TG_TABLE_NAME when 'communication_posts' then 'communication' when 'payment_charges' then 'payment' when 'segments' then 'segment' when 'featured_events' then 'featured' end;
 if kind is not null then delete from public.push_jobs where source_id=old.id and source_kind=kind;end if;
 if TG_TABLE_NAME in ('segments','communication_groups') then
  update public.communication_posts set audience_type='selected',audience_source_id=null,audience_label='Selected dancers',version=version+1 where audience_source_id=old.id and audience_type=case TG_TABLE_NAME when 'segments' then 'segment' else 'group' end;
 end if;
 if TG_TABLE_NAME='payment_charges' then
  delete from public.payment_batches where id=old.batch_id and not exists(select 1 from public.payment_charges where batch_id=old.batch_id);
 end if;
 return old;
end;$$;
create trigger purge_post after delete on public.communication_posts for each row execute function public.purge_deleted_source();
create trigger purge_charge after delete on public.payment_charges for each row execute function public.purge_deleted_source();
create trigger purge_segment after delete on public.segments for each row execute function public.purge_deleted_source();
create trigger purge_group after delete on public.communication_groups for each row execute function public.purge_deleted_source();
create trigger purge_featured after delete on public.featured_events for each row execute function public.purge_deleted_source();

create function public.queue_segment_documents() returns trigger language plpgsql security definer set search_path='' as $$
declare object_path text;
begin
 -- Serialize attachments and deletion for each immutable object, including shared/history keys.
 for object_path in select distinct path from (
  select old.document_path path
  union select details->>'document_path' from public.segment_audit where segment_id=old.id
  union select details->>'previous_document_path' from public.segment_audit where segment_id=old.id
 ) paths where path is not null order by path loop
  perform pg_advisory_xact_lock(hashtextextended(object_path,0));
 end loop;
 insert into public.formation_cleanup(path)
 select distinct path from (
  select old.document_path path
  union select details->>'document_path' from public.segment_audit where segment_id=old.id
  union select details->>'previous_document_path' from public.segment_audit where segment_id=old.id
 ) paths where path is not null
 and not exists(select 1 from public.segments s where s.id<>old.id and s.document_path=paths.path)
 and not exists(select 1 from public.segment_audit a where a.segment_id<>old.id and (a.details->>'document_path'=paths.path or a.details->>'previous_document_path'=paths.path))
 on conflict do nothing;
 return old;
end;$$;
create trigger queue_segment_documents before delete on public.segments for each row execute function public.queue_segment_documents();

-- Prevent an object scheduled for deletion from being attached again.
create function public.reject_deleted_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.document_path,0));
 if not exists(select 1 from storage.objects where bucket_id='formations' and name=new.document_path) or exists(select 1 from public.formation_cleanup where path=new.document_path) then raise exception 'PDF deleted. Upload a new PDF';end if;
 return new;
end;$$;
create trigger reject_deleted_document before insert or update of document_path on public.segments for each row execute function public.reject_deleted_document();

create function public.delete_team_item(target_id uuid,expected_version integer,item_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<1 then raise exception 'Invalid item version';end if;
 case item_kind
 when 'communication' then delete from public.communication_posts where id=target_id and version=expected_version;
 when 'group' then delete from public.communication_groups where id=target_id and version=expected_version;
 when 'segment' then delete from public.segments where id=target_id and version=expected_version;
 when 'featured' then delete from public.featured_events where id=target_id and version=expected_version;
 else raise exception 'Invalid item kind';
 end case;
 if not found then raise exception 'Item changed. Refresh';end if;
end;$$;

-- Old deployments/clients using archive still permanently delete; restore is rejected.
create or replace function public.archive_segment(target_id uuid,expected_version integer) returns void language sql security definer set search_path='' as $$select public.delete_team_item(target_id,expected_version,'segment')$$;
create or replace function public.archive_communication_group(target_id uuid,expected_version integer) returns void language sql security definer set search_path='' as $$select public.delete_team_item(target_id,expected_version,'group')$$;
create or replace function public.delete_featured_event(target_id uuid,expected_version integer) returns void language sql security definer set search_path='' as $$select public.delete_team_item(target_id,expected_version,'featured')$$;

create or replace function public.manage_communication(target_id uuid,expected_version integer,operation text,recipient_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.communication_posts;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if operation in ('delete','archive') then perform public.delete_team_item(target_id,expected_version,'communication');return;end if;
 if operation is distinct from 'reopen' then raise exception 'Invalid operation. Deleted items cannot be restored';end if;
 select * into p from public.communication_posts where id=target_id for update;
 if p.id is null or expected_version is null or p.version<>expected_version or p.archived_at is not null then raise exception 'Communication changed. Refresh';end if;
 if recipient_id is not null and (p.completion_mode='shared' or not exists(select 1 from public.communication_recipients where post_id=target_id and member_id=recipient_id)) then raise exception 'Invalid reopen recipient';end if;
 if p.completion_mode='shared' then update public.communication_posts set completed_at=null,completed_by=null where id=target_id;
 else update public.communication_recipients set completed_at=null where post_id=target_id and (recipient_id is null or member_id=recipient_id);end if;
 update public.communication_posts set version=version+1 where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'reopen',jsonb_build_object('version',expected_version+1,'recipient_id',recipient_id));
end;$$;

-- Payment manage/delete RPC remains the audited operation from migration0008.
-- Hide retained deleted charges/history even from app admins; owner database backup retains them.
drop policy payment_read on public.payment_charges;
create policy payment_read on public.payment_charges for select to authenticated using(status<>'deleted' and (public.admin_member() or (public.active_member() and member_id=auth.uid())));
drop policy payment_audit_read on public.payment_audit;
create policy payment_audit_read on public.payment_audit for select to authenticated using(exists(select 1 from public.payment_charges c where c.id=charge_id and c.status<>'deleted' and (public.admin_member() or (public.active_member() and c.member_id=auth.uid()))));
create function public.purge_deleted_payment_jobs() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='deleted' then delete from public.push_jobs where source_kind='payment' and source_id=new.id;end if;
 return new;
end;$$;
create trigger purge_deleted_payment_jobs after update of status on public.payment_charges for each row execute function public.purge_deleted_payment_jobs();
revoke all on function public.purge_deleted_payment_jobs() from public,anon,authenticated;
create function public.formation_cleanup_jobs() returns setof text language sql security definer set search_path='' as $$select path from public.formation_cleanup order by created_at,path limit 40$$;
create function public.finish_formation_cleanup(p_paths text[]) returns void language sql security definer set search_path='' as $$delete from public.formation_cleanup where path=any(p_paths)$$;
revoke all on function public.purge_deleted_source(),public.queue_segment_documents(),public.reject_deleted_document(),public.delete_team_item(uuid,integer,text),public.formation_cleanup_jobs(),public.finish_formation_cleanup(text[]) from public,anon,authenticated;
grant execute on function public.delete_team_item(uuid,integer,text) to authenticated;
grant execute on function public.formation_cleanup_jobs(),public.finish_formation_cleanup(text[]) to service_role;

-- Purge existing deleted records using the same cascades and object cleanup queue.
delete from public.communication_posts where archived_at is not null;
delete from public.communication_groups where archived_at is not null;
delete from public.segments where archived_at is not null;
delete from public.push_jobs where source_kind='payment' and source_id in(select id from public.payment_charges where status='deleted');
delete from public.featured_events where deleted_at is not null;

-- No admin bypass can expose deleted or unreferenced formation files.
drop policy formations_read on storage.objects;
create policy formations_read on storage.objects for select to authenticated using(
 bucket_id='formations' and storage.allow_only_operation('object.get_authenticated') and public.active_member() and
 (exists(select 1 from public.segments s where s.document_path=storage.objects.name and s.archived_at is null)
 or (public.admin_member() and exists(select 1 from public.segment_audit a join public.segments s on s.id=a.segment_id where s.archived_at is null and (a.details->>'document_path'=storage.objects.name or a.details->>'previous_document_path'=storage.objects.name))))
);

-- Existing reminder and action workers cannot deliver retained deleted payments.
create or replace function public.push_job_valid(p_job public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.push_member_active(p_member) and case p_job.source_kind
 when 'communication' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=p_job.source_id and r.member_id=p_member and p.archived_at is null and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null)))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=p_job.source_id and c.status<>'deleted' and c.member_id=p_member and (p_job.event_key not like 'reminder:%' or c.status='unpaid'))
 when 'segment' then exists(select 1 from public.segments s join public.segment_members m on m.segment_id=s.id where s.id=p_job.source_id and s.archived_at is null and m.member_id=p_member)
 when 'featured' then exists(select 1 from public.featured_events e where e.id=p_job.source_id and e.deleted_at is null)
 when 'membership' then p_job.source_id=p_member
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=p_job.event_key and e->>'allDay'='false' and (e->>'start')::timestamptz>now()))
 else false end;
$$;
create or replace function public.push_payment_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='deleted' then return new;end if;
 if TG_OP='INSERT' or (new.status<>'reported' and (old.status is distinct from new.status or old.amount_cents is distinct from new.amount_cents or old.reason is distinct from new.reason or old.instructions is distinct from new.instructions or old.due_on is distinct from new.due_on)) then
  perform public.push_enqueue(array[new.member_id],'payment','payment:'||new.id||':'||new.version,new.id,'payment','/payments/'||new.id::text);
 end if;return new;
end;$$;

