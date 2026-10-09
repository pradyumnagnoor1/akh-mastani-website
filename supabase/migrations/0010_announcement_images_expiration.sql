-- Optional private JPEG attachments and permanent expiration. Requires complete0009.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani:migration:0010',0));
alter table public.communication_posts add column expires_at timestamptz;
alter table public.featured_events add column expires_at timestamptz;
create index communication_expiration on public.communication_posts(expires_at) where expires_at is not null;
create index featured_expiration on public.featured_events(expires_at) where expires_at is not null;

create table public.announcement_uploads(
 path text primary key,post_id uuid not null,owner_id uuid references public.members(id) on delete set null,
 validated boolean not null default false,
 state text not null default 'pending' check(state in ('pending','attached','cleanup')),
 created_at timestamptz not null default now(),cleanup_after timestamptz,cleaned_at timestamptz,
 check(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
);
create index announcement_upload_sweep on public.announcement_uploads(state,created_at);
alter table public.announcement_uploads enable row level security;
revoke all on public.announcement_uploads from public,anon,authenticated;
grant select on public.announcement_uploads to authenticated;
create policy upload_owner_read on public.announcement_uploads for select to authenticated using(public.admin_member() and owner_id=auth.uid());
alter table public.communication_posts add column image_path text references public.announcement_uploads(path);
alter table public.communication_posts add column image_description text not null default '' check(char_length(image_description)<=200);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('announcement-images','announcement-images',false,1048576,array['image/jpeg']);

-- This predicate includes expiry for EVERY app role, including admins.
create function public.communication_access(target_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.communication_posts p where p.id=target_id and p.archived_at is null and (p.expires_at is null or p.expires_at>now()) and (public.admin_member() or exists(select 1 from public.communication_recipients r where r.post_id=p.id and r.member_id=auth.uid())))
$$;
create or replace function public.communication_visible(target_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=target_id and p.archived_at is null and (p.expires_at is null or p.expires_at>now()) and r.member_id=auth.uid())
$$;
drop policy communication_posts_read on public.communication_posts;
create policy communication_posts_read on public.communication_posts for select to authenticated using(public.communication_access(id));
drop policy communication_recipients_read on public.communication_recipients;
create policy communication_recipients_read on public.communication_recipients for select to authenticated using(public.communication_access(post_id) and (public.admin_member() or member_id=auth.uid()));
drop policy communication_audit_read on public.communication_audit;
create policy communication_audit_read on public.communication_audit for select to authenticated using(public.admin_member() and public.communication_access(post_id));
drop policy featured_read on public.featured_events;
create policy featured_read on public.featured_events for select to authenticated using(public.active_member() and deleted_at is null and (expires_at is null or expires_at>now()));
drop policy featured_audit_read on public.featured_event_audit;
create policy featured_audit_read on public.featured_event_audit for select to authenticated using(public.admin_member() and exists(select 1 from public.featured_events e where e.id=event_id));
-- Bytes can only be uploaded by the validated server action using service_role.
-- No browser/SDK caller may hold an arbitrary direct upload in flight.
create policy announcement_image_read on storage.objects for select to authenticated using(bucket_id='announcement-images' and storage.allow_only_operation('object.get_authenticated') and exists(select 1 from public.communication_posts p where p.image_path=name and public.communication_access(p.id)));

create function public.expiration_cutoff(expiration_date date) returns timestamptz language plpgsql stable set search_path='' as $$
begin
 if expiration_date is null then return null;end if;
 if expiration_date< (now() at time zone 'America/Chicago')::date or expiration_date>'2100-12-31' then raise exception 'Choose an expiration date today or later';end if;
 return (expiration_date+1)::timestamp at time zone 'America/Chicago';
end;$$;
create function public.reject_expired_change() returns trigger language plpgsql set search_path='' as $$
begin
 if old.expires_at is not null and old.expires_at<=now() then raise exception 'This item expired. Refresh';end if;
 return new;
end;$$;
create trigger reject_expired_post before update on public.communication_posts for each row execute function public.reject_expired_change();
create trigger reject_expired_featured before update on public.featured_events for each row execute function public.reject_expired_change();
-- Recipient changes by older clients cannot complete an expired item either.
create function public.reject_expired_completion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.communication_posts where id=new.post_id and expires_at<=now()) then raise exception 'This item expired. Refresh';end if;
 return new;
end;$$;
create trigger reject_expired_completion before update on public.communication_recipients for each row execute function public.reject_expired_completion();

create function public.reserve_announcement_image(target_id uuid,expected_version integer) returns text language plpgsql security definer set search_path='' as $$
declare p public.communication_posts;object_path text;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid version';end if;
 perform pg_advisory_xact_lock(hashtextextended('image-owner:'||auth.uid()::text,0));
 select * into p from public.communication_posts where id=target_id for update;
 if (p.id is null and expected_version<>0) or (p.id is not null and (p.kind<>'announcement' or p.version<>expected_version or p.archived_at is not null or p.expires_at<=now())) then raise exception 'Announcement changed. Refresh';end if;
 if (select count(*) from public.announcement_uploads where owner_id=auth.uid() and state='pending' and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many unfinished images. Remove one or try later';end if;
 object_path:=auth.uid()::text||'/'||gen_random_uuid()::text||'.jpg';
 insert into public.announcement_uploads(path,post_id,owner_id) values(object_path,target_id,auth.uid());
 return object_path;
end;$$;
create function public.verify_announcement_image(object_path text,actor_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.announcement_uploads set validated=true where path=object_path and owner_id=actor_id and state='pending' and created_at>now()-interval '1 hour';
 if not found then raise exception 'Image unavailable';end if;
end;$$;
create function public.abandon_announcement_image(object_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 update public.announcement_uploads set state='cleanup',cleanup_after=now()+interval '2 minutes' where path=object_path and owner_id=auth.uid() and state='pending';
end;$$;
create function public.queue_announcement_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.image_path is not null and (TG_OP='DELETE' or old.image_path is distinct from new.image_path) then
  update public.announcement_uploads set state='cleanup',cleanup_after=now() where path=old.image_path;
 end if;
 if TG_OP='DELETE' then return old;end if;
 return new;
end;$$;
create trigger queue_announcement_image after update of image_path or delete on public.communication_posts for each row execute function public.queue_announcement_image();

create function public.save_communication_media(target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text) returns uuid language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz;prior_image text;u public.announcement_uploads;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 cutoff:=public.expiration_cutoff(expiration_date);
 if char_length(coalesce(image_alt,''))>200 or (post_kind<>'announcement' and image_object is not null) then raise exception 'Invalid image';end if;
 -- Core RPC obtains the item lock/version check. Entire wrapper is one transaction.
 perform public.save_communication(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date);
 select image_path into prior_image from public.communication_posts where id=target_id;
 if image_object is not null and image_object is distinct from prior_image then
  select * into u from public.announcement_uploads where path=image_object for update;
  if u.path is null or u.post_id<>target_id or u.owner_id is distinct from auth.uid() or u.state<>'pending' or not u.validated or u.created_at<=now()-interval '1 hour' or not exists(select 1 from storage.objects where bucket_id='announcement-images' and name=image_object) then raise exception 'Image unavailable. Choose it again';end if;
  update public.announcement_uploads set state='attached' where path=image_object;
 end if;
 update public.communication_posts set expires_at=cutoff,image_path=image_object,image_description=case when image_object is null then '' else coalesce(image_alt,'') end where id=target_id;
 return target_id;
end;$$;
create function public.save_featured_event_expiring(target_id uuid,expected_version integer,event_title text,event_description text,event_day date,event_time time,event_location text,event_url text,expiration_date date) returns void language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz;prior public.featured_events;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 cutoff:=public.expiration_cutoff(expiration_date);
 select * into prior from public.featured_events where id=target_id for update;
 if prior.expires_at<=now() then raise exception 'This item expired. Refresh';end if;
 perform public.save_featured_event(target_id,expected_version,event_title,event_description,event_day,event_time,event_location,event_url);
 if prior.expires_at is distinct from cutoff then
  update public.featured_events set expires_at=cutoff,version=case when version=expected_version then version+1 else version end,updated_at=now() where id=target_id;
  insert into public.featured_event_audit(event_id,actor_id,action,details) values(target_id,auth.uid(),'expiration',jsonb_build_object('before',prior.expires_at,'after',cutoff));
 end if;
end;$$;

-- Suppress expired sources at both enqueue and dispatch, including older RPCs.
create or replace function public.push_enqueue(p_members uuid[],p_category text,p_key text,p_source uuid,p_kind text,p_url text,p_expiry timestamptz default now()+interval '1 day') returns integer language plpgsql security definer set search_path='' as $$
declare n integer;cutoff timestamptz;
begin
 if p_kind='communication' then select expires_at into cutoff from public.communication_posts where id=p_source;
 elsif p_kind='featured' then select expires_at into cutoff from public.featured_events where id=p_source;end if;
 if cutoff<=now() then return 0;end if;
 p_expiry:=least(p_expiry,coalesce(cutoff,p_expiry));
 insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at)
 select s.id,p_category,p_key,p_source,p_kind,jsonb_build_object('title',case when p_category='announcement' and p_kind='communication' then coalesce((select title from public.communication_posts where id=p_source),'AKH Mastani') else 'AKH Mastani' end,'body',case p_category when 'announcement' then 'A team announcement is available.' when 'task' then 'Check your team to-dos.' when 'payment' then 'Check your payments for an update.' when 'membership' then 'Your membership has been approved.' when 'segment' then 'Your set design has an update.' when 'featured' then 'A featured event has an update. Check the calendar.' else 'Practice is coming up. Check the calendar.' end,'url',p_url),p_expiry
 from public.push_subscriptions s where s.member_id=any(p_members) and public.push_member_active(s.member_id)
 on conflict(subscription_id,event_key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
create or replace function public.push_job_valid(p_job public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.push_member_active(p_member) and case p_job.source_kind
 when 'communication' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=p_job.source_id and r.member_id=p_member and p.archived_at is null and (p.expires_at is null or p.expires_at>now()) and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null)))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=p_job.source_id and c.status<>'deleted' and c.member_id=p_member and (p_job.event_key not like 'reminder:%' or c.status='unpaid'))
 when 'segment' then exists(select 1 from public.segments s join public.segment_members m on m.segment_id=s.id where s.id=p_job.source_id and s.archived_at is null and m.member_id=p_member)
 when 'featured' then exists(select 1 from public.featured_events e where e.id=p_job.source_id and e.deleted_at is null and (e.expires_at is null or e.expires_at>now()))
 when 'membership' then p_job.source_id=p_member
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=p_job.event_key and e->>'allDay'='false' and (e->>'start')::timestamptz>now()))
 else false end;
$$;

create function public.purge_expired_items() returns integer language plpgsql security definer set search_path='' as $$
declare total integer;n integer;
begin
 delete from public.communication_posts where id in(select id from public.communication_posts where expires_at<=now() order by expires_at,id limit 200 for update skip locked);get diagnostics total=row_count;
 delete from public.featured_events where id in(select id from public.featured_events where expires_at<=now() order by expires_at,id limit 200 for update skip locked);get diagnostics n=row_count;
 update public.announcement_uploads set state='cleanup',cleanup_after=now() where path in(select path from public.announcement_uploads where state='pending' and created_at<=now()-interval '1 hour' order by created_at limit 200 for update skip locked);
 return total+n;
end;$$;
create function public.announcement_cleanup_jobs() returns setof text language sql security definer set search_path='' as $$select path from public.announcement_uploads where state='cleanup' and cleanup_after<=now() and (cleaned_at is null or cleaned_at<now()-interval '1 hour') order by created_at,path limit 40$$;
create function public.finish_announcement_cleanup(p_paths text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Reconcile late provider responses for a day. Operational tombstones contain
 -- only private object keys, no images/post bodies, and can never be reattached.
 delete from public.announcement_uploads where state='cleanup' and path=any(p_paths) and cleanup_after<now()-interval '1 day';
 update public.announcement_uploads set cleaned_at=now() where state='cleanup' and path=any(p_paths);
end;$$;
revoke all on function public.communication_access(uuid),public.expiration_cutoff(date),public.reject_expired_change(),public.reject_expired_completion(),public.reserve_announcement_image(uuid,integer),public.abandon_announcement_image(text),public.queue_announcement_image(),public.save_communication_media(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text),public.save_featured_event_expiring(uuid,integer,text,text,date,time,text,text,date),public.push_enqueue(uuid[],text,text,uuid,text,text,timestamptz),public.push_job_valid(public.push_jobs,uuid),public.verify_announcement_image(text,uuid),public.purge_expired_items(),public.announcement_cleanup_jobs(),public.finish_announcement_cleanup(text[]) from public,anon,authenticated,service_role;
grant execute on function public.communication_access(uuid),public.reserve_announcement_image(uuid,integer),public.abandon_announcement_image(text),public.save_communication_media(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text),public.save_featured_event_expiring(uuid,integer,text,text,date,time,text,text,date) to authenticated;
grant execute on function public.verify_announcement_image(text,uuid),public.purge_expired_items(),public.announcement_cleanup_jobs(),public.finish_announcement_cleanup(text[]) to service_role;
commit;
