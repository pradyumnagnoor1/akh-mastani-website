begin;
-- Google is a reference source; only website practices drive operational schedules.
create or replace function public.practice_schedule(stamp timestamptz default now()) returns table(source text,event jsonb) language sql stable security definer set search_path='' as $$
 select 'custom',public.custom_practice_event(c) from public.custom_practices c;
$$;
alter table public.custom_practices add column announcement_id uuid references public.communication_posts(id) on delete cascade;
create function public.practice_member_allowed(event_id text,member_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (auth.uid() is null or $2=auth.uid() or public.admin_member()) and exists(select 1 from public.custom_practices c where 'custom:'||c.id=event_id and
 (c.announcement_id is null or exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=c.announcement_id and r.member_id=$2 and p.archived_at is null and (p.expires_at is null or p.expires_at>now()))));
$$;
revoke all on function public.practice_member_allowed(text,uuid) from public,anon;
grant execute on function public.practice_member_allowed(text,uuid) to authenticated;
drop policy custom_practice_read on public.custom_practices;
create policy custom_practice_read on public.custom_practices for select to authenticated using(public.active_member());
create function public.attach_practice_announcement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.practice_source='custom' and (tg_op='INSERT' or old.practice_event_id is distinct from new.practice_event_id) then
  update public.custom_practices set announcement_id=new.id where 'custom:'||id=new.practice_event_id and announcement_id is null;
 end if;
 return new;
end;$$;
create trigger attach_practice_announcement after insert or update of practice_event_id on public.communication_posts for each row execute function public.attach_practice_announcement();
-- Existing associations stay unowned, preserving shared legacy custom events.
-- Restrict direct RPC callers as well as the composer. Existing historical Google links may only be retained unchanged.
do $$ declare body text; begin
 select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_announcement';
 body:=replace(body,'if practice_id is not null then',E'if calendar_source=''custom'' and practice_id is not null and not coalesce(prior.practice_event_id=practice_id and prior.practice_source=calendar_source,false) and current_setting(''app.practice_publication'',true) is distinct from target_id::text then raise exception ''Create a practice event with this announcement'';end if;\n if practice_id is not null then');
 body:=replace(body,'if practice_id is not null then',E'if prior.practice_source=''custom'' and exists(select 1 from public.custom_practices c where c.announcement_id=target_id) and (practice_id is distinct from prior.practice_event_id or calendar_source is distinct from prior.practice_source) then raise exception ''Practice event cannot be detached'';end if;\n if practice_id is not null then');
 body:=replace(body,'if practice_id is not null then',E'if practice_id is not null and calendar_source<>''custom'' and not coalesce((prior.practice_event_id=practice_id and prior.practice_source=calendar_source),false) then raise exception ''Create a website practice event'';end if;\n if practice_id is not null then');
 execute body;
end $$;
-- The atomic custom wrapper is the only entry point for a new event association.
do $$ declare body text; begin
 select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_announcement_custom';
 body:=replace(body,'perform public.save_custom_practice',E'if exists(select 1 from public.custom_practices c where c.id=custom_id and c.announcement_id is distinct from target_id and not (c.announcement_id is null and exists(select 1 from public.communication_posts p where p.id=target_id and p.practice_source=''custom'' and p.practice_event_id=''custom:''||custom_id))) then raise exception ''Create a new practice event'';end if;\n perform set_config(''app.practice_publication'',target_id::text,true);\n perform public.save_custom_practice');
 execute body;
end $$;
-- Apply audience checks at enqueue and send-time, including already queued jobs.
do $$ declare body text; name text; begin
 foreach name in array array['nudge_enqueue','push_enqueue_legacy_reminders'] loop
  select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  if body is null then continue;end if;
  body:=replace(body,'where public.nudge_member_enabled(id) loop','where public.nudge_member_enabled(id) and public.practice_member_allowed(e->>''id'',id) loop');
  body:=replace(body,'total:=total+public.push_enqueue(ids,''practice''', 'select array_agg(id) into ids from public.members where status=''active'' and public.practice_member_allowed(e->>''id'',id); total:=total+public.push_enqueue(ids,''practice''');
  execute body;
 end loop;
 foreach name in array array['nudge_scheduled_valid','push_legacy_job_valid'] loop
  select pg_get_functiondef(p.oid) into body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  body:=replace(body,'when ''practice'' then exists','when ''practice'' then public.practice_member_allowed(split_part('||case when name='nudge_scheduled_valid' then 'o.source_token' else 'p_job.event_key' end||', '':'', 2)||'':''||split_part('||case when name='nudge_scheduled_valid' then 'o.source_token' else 'p_job.event_key' end||', '':'', 3), '||case when name='nudge_scheduled_valid' then 'o.member_id' else 'p_member' end||') and exists');
  execute body;
 end loop;
end $$;
-- Remove obsolete operational Google jobs; sent history remains untouched.
delete from public.push_jobs where source_kind='practice' and status='pending' and event_key not like 'practice:custom:%';
update public.nudge_occurrences set state='suppressed' where source_kind='practice' and state='pending' and source_token not like 'practice:custom:%';

-- Cascaded deletion of an owned practice also purges operational reminders.
create function public.purge_owned_practice_jobs() returns trigger language plpgsql security definer set search_path='' as $$
declare affected_bundles uuid[];
begin
 select array_agg(distinct bundle_id) into affected_bundles from public.nudge_occurrences where source_kind='practice' and source_token like 'practice:custom:'||old.id||':%';
 delete from public.nudge_occurrences where source_kind='practice' and source_token like 'practice:custom:'||old.id||':%';
 -- Surviving mixed bundles retain other reminders, but no deleted practice details.
 update public.push_jobs set payload=jsonb_build_object('title','AKH Mastani','body','Open your Today plan.','url','/home') where source_kind='nudge' and source_id=any(affected_bundles);
 delete from public.push_jobs where source_kind='practice' and event_key like 'practice:custom:'||old.id||':%';
 delete from public.push_jobs where source_kind='nudge' and source_id in(select b.id from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id));
 delete from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id);
 return old;

end;$$;
revoke all on function public.purge_owned_practice_jobs() from public,anon,authenticated;
create trigger purge_owned_practice_jobs before delete on public.custom_practices for each row execute function public.purge_owned_practice_jobs();

commit;
