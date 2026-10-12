-- Additive rollout: legacy reminders remain active until the owner enables nudges.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0012',0));

alter table public.segments add column formation_updated_at timestamptz;
alter table public.segments add column assignments_updated_at timestamptz;
create function public.digest_segment_change() returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb;
begin
 if new.action not in ('created','updated') then return new;end if;
 select details into prior from public.segment_audit where segment_id=new.segment_id and id<new.id and action in ('created','updated') order by id desc limit 1;
 update public.segments set
 formation_updated_at=case when prior is null or prior->'document_path' is distinct from new.details->'document_path' then new.created_at else formation_updated_at end,
 assignments_updated_at=case when prior is null or not ((prior->'members') @> (new.details->'members') and (new.details->'members') @> (prior->'members')) then new.created_at else assignments_updated_at end
 where id=new.segment_id;
 return new;
end;$$;
create trigger digest_segment_change after insert on public.segment_audit for each row execute function public.digest_segment_change();
-- Backfill only audit-proven changes; a recent rename must not imply a new PDF.
with history as (
 select segment_id,created_at,details,lag(details) over(partition by segment_id order by id) prior
 from public.segment_audit where action in ('created','updated')
), changes as (
 select segment_id,max(created_at) filter(where prior is null or prior->'document_path' is distinct from details->'document_path') formation,
 max(created_at) filter(where prior is null or not ((prior->'members') @> (details->'members') and (details->'members') @> (prior->'members'))) assignments
 from history group by segment_id
)
update public.segments s set formation_updated_at=c.formation,assignments_updated_at=c.assignments from changes c where s.id=c.segment_id;

alter table public.communication_posts add column reminder_at timestamptz;
alter table public.communication_posts add column reminder_mode text check(reminder_mode in ('acknowledgment','preparation','linked-task'));
alter table public.communication_posts add column reminder_message text not null default '' check(char_length(reminder_message)<=200);
alter table public.communication_posts add column reminder_task_id uuid references public.communication_posts(id) on delete set null;
alter table public.communication_posts add column reminder_revision integer not null default 0;

create function public.save_communication_reminder(
 target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text,
 reminder_time timestamptz,reminder_type text,reminder_text text,linked_task uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.communication_posts; result uuid; changed boolean;
begin
 if not public.admin_member() then raise exception 'Admin required';end if;
 select * into p from public.communication_posts where id=target_id for update;
 changed:=row(p.reminder_at,p.reminder_mode,p.reminder_message,p.reminder_task_id) is distinct from row(reminder_time,reminder_type,coalesce(reminder_text,''),linked_task);
 if reminder_time is not null then
  if post_kind<>'announcement' or reminder_type is null or reminder_type not in ('acknowledgment','preparation','linked-task') then raise exception 'Choose an announcement reminder type';end if;
  if changed and (reminder_time<=now() or reminder_time>now()+interval '366 days') then raise exception 'Choose a future reminder within one year';end if;
  if char_length(coalesce(reminder_text,''))>200 or coalesce(reminder_text,'') ~ '[[:cntrl:]]' then raise exception 'Use a reminder message of up to 200 characters';end if;
  if expiration_date is not null and reminder_time>=((expiration_date+1)::timestamp at time zone 'America/Chicago') then raise exception 'Reminder must be before announcement expiration';end if;
  if reminder_type='linked-task' and not exists(select 1 from public.communication_posts t where t.id=linked_task and t.kind='task' and t.archived_at is null and (t.expires_at is null or t.expires_at>now())) then raise exception 'Choose a live linked task';end if;
 elsif reminder_type is not null or linked_task is not null or coalesce(reminder_text,'')<>'' then raise exception 'Choose a reminder time';end if;
 if reminder_type is distinct from 'linked-task' and linked_task is not null then raise exception 'Only task reminders may link a task';end if;
 result:=public.save_communication_media(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date,expiration_date,image_object,image_alt);
 update public.communication_posts set reminder_at=reminder_time,reminder_mode=reminder_type,reminder_message=coalesce(reminder_text,''),reminder_task_id=linked_task,
 reminder_revision=reminder_revision+case when changed then 1 else 0 end,
 version=version+case when changed and p.id is not null and version=expected_version then 1 else 0 end where id=target_id;
 if changed and reminder_time is not null or changed and p.reminder_at is not null then
  insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'reminder_saved',jsonb_build_object('time',reminder_time,'type',reminder_type,'message',coalesce(reminder_text,''),'task',linked_task));
 end if;
 return result;
end;$$;

create table public.nudge_control(id boolean primary key default true check(id),enabled boolean not null default false,pilot_members uuid[]);
insert into public.nudge_control(id) values(true);
create table public.nudge_bundles(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id) on delete cascade,
 day date not null,window_key bigint not null,created_at timestamptz not null default now(),unique(member_id,day,window_key)
);
create table public.nudge_quota(member_id uuid not null references public.members(id) on delete cascade,day date not null,reserved integer not null default 0 check(reserved between 0 and 3),primary key(member_id,day));
create table public.nudge_occurrences(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id) on delete cascade,
 event_key text not null,source_kind text not null check(source_kind in ('task','payment','announcement','practice')),
 source_id uuid,source_token text not null,stage text not null,priority integer not null,
 available_at timestamptz not null,expires_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','bundled','suppressed')),
 bundle_id uuid references public.nudge_bundles(id) on delete cascade,
 created_at timestamptz not null default now(),unique(member_id,event_key)
);
create index nudge_pending on public.nudge_occurrences(member_id,available_at) where state='pending';
create index nudge_sources on public.nudge_occurrences(source_kind,source_id);
create index nudge_bundle_items on public.nudge_occurrences(bundle_id);
create index push_jobs_nudge_source on public.push_jobs(source_id) where source_kind='nudge';
alter table public.nudge_control enable row level security;
alter table public.nudge_bundles enable row level security;
alter table public.nudge_quota enable row level security;
alter table public.nudge_occurrences enable row level security;
revoke all on public.nudge_control,public.nudge_bundles,public.nudge_quota,public.nudge_occurrences from public,anon,authenticated,service_role;

create function public.nudge_member_enabled(p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled and (pilot_members is null or p_member=any(pilot_members)) from public.nudge_control where id),false);
$$;
create function public.nudge_legacy_stage_sent(p_member uuid,p_key text,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nudge_occurrences o join public.push_jobs j on j.source_id=o.bundle_id and j.source_kind='nudge'
 where o.member_id=p_member and o.event_key=case when p_kind='practice' then p_key else regexp_replace(p_key,'^reminder:(task|payment):([^:]+):(.+)$','\1:\2:due:\3') end and j.status='sent');
$$;
-- Keep immediate alerts unchanged, but do not create legacy jobs for smart pilots.
-- A rollback also avoids repeating a due/practice stage confirmed sent by nudges.
create or replace function public.push_enqueue(p_members uuid[],p_category text,p_key text,p_source uuid,p_kind text,p_url text,p_expiry timestamptz default now()+interval '1 day') returns integer language plpgsql security definer set search_path='' as $$
declare n integer;cutoff timestamptz;
begin
 if p_kind='communication' then select expires_at into cutoff from public.communication_posts where id=p_source;
 elsif p_kind='featured' then select expires_at into cutoff from public.featured_events where id=p_source;end if;
 if cutoff<=now() then return 0;end if;
 p_expiry:=least(p_expiry,coalesce(cutoff,p_expiry));
 if p_key like 'reminder:%' or p_kind='practice' then
  select array_agg(person) into p_members from unnest(p_members) person where not public.nudge_member_enabled(person)
   and not public.nudge_legacy_stage_sent(person,p_key,p_kind);
 end if;
 insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at)
 select s.id,p_category,p_key,p_source,p_kind,jsonb_build_object('title',case when p_category='announcement' and p_kind='communication' then coalesce((select title from public.communication_posts where id=p_source),'AKH Mastani') else 'AKH Mastani' end,'body',case p_category when 'announcement' then 'A team announcement is available.' when 'task' then 'Check your team to-dos.' when 'payment' then 'Check your payments for an update.' when 'membership' then 'Your membership has been approved.' when 'segment' then 'Your set design has an update.' when 'featured' then 'A featured event has an update. Check the calendar.' else 'Practice is coming up. Check the calendar.' end,'url',p_url),p_expiry
 from public.push_subscriptions s where s.member_id=any(p_members) and public.push_member_active(s.member_id)
 on conflict(subscription_id,event_key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
create function public.nudge_valid(o public.nudge_occurrences,stamp timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select public.nudge_member_enabled(o.member_id) and public.push_member_active(o.member_id) and o.expires_at>stamp and case o.source_kind
 when 'task' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='task' and p.due_on::text=o.source_token and r.member_id=o.member_id and r.completed_at is null and p.completed_at is null and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=o.source_id and c.member_id=o.member_id and c.due_on::text=o.source_token and c.status='unpaid')
 when 'announcement' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='announcement' and p.reminder_revision::text=o.source_token and p.reminder_at is not null and r.member_id=o.member_id and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp) and
  case p.reminder_mode when 'preparation' then true when 'acknowledgment' then r.completed_at is null when 'linked-task' then exists(select 1 from public.communication_posts t join public.communication_recipients tr on tr.post_id=t.id where t.id=p.reminder_task_id and t.kind='task' and tr.member_id=o.member_id and tr.completed_at is null and t.completed_at is null and t.archived_at is null and (t.expires_at is null or t.expires_at>stamp)) else false end)
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>stamp-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=o.source_token and e->>'allDay'='false' and (e->>'start')::timestamptz>stamp))
 else false end;
$$;

create function public.nudge_payload(p_bundle uuid,stamp timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer;t integer;c integer;a integer;p integer;path text;cutoff timestamptz;
begin
 if (stamp at time zone 'America/Chicago')::time<time '09:00' or (stamp at time zone 'America/Chicago')::time>=time '22:00' then return null;end if;
 select count(*),count(*) filter(where source_kind='task'),count(*) filter(where source_kind='payment'),count(*) filter(where source_kind='announcement'),count(*) filter(where source_kind='practice'),min(case source_kind when 'task' then '/todos/'||source_id when 'payment' then '/payments/'||source_id when 'announcement' then '/announcements/'||source_id else '/calendar' end)
 ,min(expires_at) into n,t,c,a,p,path,cutoff from public.nudge_occurrences o where bundle_id=p_bundle and public.nudge_valid(o,stamp);
 if n=0 then return null;end if;
 return jsonb_build_object('title','AKH Mastani','body','Today: '||concat_ws(', ',case when t>0 then t||' to-do'||case when t=1 then '' else 's' end end,case when c>0 then c||' payment'||case when c=1 then '' else 's' end end,case when a>0 then a||' announcement reminder'||case when a=1 then '' else 's' end end,case when p>0 then 'practice coming up' end)||'. Open your plan.','url',case when n=1 then path else '/home' end,'expiresAt',cutoff);
end;$$;

-- Optional clock is service-only test/operational input; browsers cannot call this RPC.
create function public.nudge_enqueue(stamp timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<schedule>>
declare day date:=(stamp at time zone 'America/Chicago')::date;clock time:=(stamp at time zone 'America/Chicago')::time;
 m record; c record; e jsonb; stage text;scheduled timestamptz;expiry timestamptz;starts timestamptz;local_start timestamp;token text;key text;bid uuid;quota integer;payload jsonb;n integer;total integer:=0;ids uuid[];
begin
 -- Only a short delivery window is generated; outages never replay every past stage.
 for c in select p.id,p.due_on,p.expires_at,r.member_id from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.kind='task' and p.archived_at is null and p.completed_at is null and r.completed_at is null and p.due_on between day-1 and day+1 loop
  stage:=case when c.due_on=day+1 then 'before' when c.due_on=day then 'due' else 'follow-up' end;
  scheduled:=(day+case when stage='before' then time '18:00' else time '09:00' end) at time zone 'America/Chicago';
  expiry:=least((day+time '22:00') at time zone 'America/Chicago',coalesce(c.expires_at,(day+time '22:00') at time zone 'America/Chicago'));
  if scheduled>stamp or expiry<=stamp or not public.nudge_member_enabled(c.member_id) then continue;end if;
  key:='task:'||c.id||':'||stage||':'||c.due_on;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,key,'task',c.id,c.due_on::text,stage,case when stage='due' then 2 else 3 end,scheduled,expiry) on conflict(member_id,event_key) do nothing;
 end loop;
 for c in select id,member_id,due_on from public.payment_charges where status='unpaid' and due_on between day-1 and day loop
  if not public.nudge_member_enabled(c.member_id) then continue;end if;
  stage:=case when c.due_on=day then 'due' else 'follow-up' end;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,'payment:'||c.id||':'||stage||':'||c.due_on,'payment',c.id,c.due_on::text,stage,case when stage='due' then 2 else 3 end,(day+time '09:00') at time zone 'America/Chicago',(day+time '22:00') at time zone 'America/Chicago') on conflict(member_id,event_key) do nothing;
 end loop;
 for c in select p.*,r.member_id from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.kind='announcement' and p.reminder_at is not null and p.archived_at is null and p.reminder_at>stamp-interval '2 days' and p.reminder_at<=stamp loop
  if not public.nudge_member_enabled(c.member_id) then continue;end if;
  local_start:=c.reminder_at at time zone 'America/Chicago';
  if local_start::time>=time '22:00' then scheduled:=((local_start::date+1)+time '09:00') at time zone 'America/Chicago';
  elsif local_start::time<time '09:00' then scheduled:=(local_start::date+time '09:00') at time zone 'America/Chicago';else scheduled:=c.reminder_at;end if;
  -- Author-selected reminders have a bounded six-hour useful window, ending at quiet hours/expiry.
  expiry:=least(scheduled+interval '6 hours',((scheduled at time zone 'America/Chicago')::date+time '22:00') at time zone 'America/Chicago',coalesce(c.expires_at,scheduled+interval '6 hours'));
  if scheduled>stamp or expiry<=stamp then continue;end if;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,'announcement:'||c.id||':'||c.reminder_revision,'announcement',c.id,c.reminder_revision::text,'author',case when c.reminder_mode='preparation' then 1 else 2 end,scheduled,expiry) on conflict(member_id,event_key) do nothing;
 end loop;
 for e in select value from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) where s.last_success_at>stamp-interval '15 minutes' and public.push_calendar_current(s.source_fingerprint) loop
  if e->>'allDay'<>'false' then continue;end if;
  begin starts:=(e->>'start')::timestamptz;exception when others then continue;end;
  scheduled:=starts-interval '60 minutes';local_start:=scheduled at time zone 'America/Chicago';
  -- Advance a quiet-hours practice reminder only when <= two hours before start.
  if local_start::time>=time '22:00' then scheduled:=(local_start::date+time '21:55') at time zone 'America/Chicago';
  elsif local_start::time<time '09:00' then scheduled:=((local_start::date-1)+time '21:55') at time zone 'America/Chicago';end if;
  if starts-scheduled>interval '2 hours' or scheduled>stamp or starts<=stamp or stamp>scheduled+interval '30 minutes' then continue;end if;
  token:='practice:'||(e->>'id')||':'||(e->>'start');
  for m in select id from public.members where public.nudge_member_enabled(id) loop
   insert into public.nudge_occurrences(member_id,event_key,source_kind,source_token,stage,priority,available_at,expires_at)
   values(m.id,token,'practice',token,'practice',0,scheduled,starts) on conflict(member_id,event_key) do nothing;
  end loop;
 end loop;
 -- Legacy already-sent due/practice reminders must not be replayed at enable time.
 update public.nudge_occurrences o set state='suppressed' where state='pending' and exists(select 1 from public.push_jobs j join public.push_subscriptions s on s.id=j.subscription_id where s.member_id=o.member_id and j.status='sent' and j.event_key=case when o.source_kind='practice' then o.source_token when o.stage='due' then 'reminder:'||o.source_kind||':'||o.source_id||':'||o.source_token else '' end);
 update public.nudge_occurrences o set state='suppressed' where state='pending' and not public.nudge_valid(o,stamp);
 if clock<time '09:00' or clock>=time '22:00' then return 0;end if;
 for m in select distinct member_id from public.nudge_occurrences where state='pending' and available_at<=stamp and expires_at>stamp loop
  -- Serialize quota, bundling and fan-out for one member across overlapping runs.
  perform pg_advisory_xact_lock(hashtextextended('nudge:'||m.member_id::text,0));
  if not exists(select 1 from public.push_subscriptions where member_id=m.member_id) then continue;end if;
  if exists(select 1 from public.nudge_bundles where member_id=m.member_id and day=schedule.day and window_key=floor(extract(epoch from stamp)/300)::bigint) then continue;end if;
  insert into public.nudge_quota(member_id,day) values(m.member_id,day) on conflict do nothing;
  update public.nudge_quota q set reserved=reserved+1 where q.member_id=m.member_id and q.day=schedule.day and reserved<3 returning reserved into quota;
  if not found then update public.nudge_occurrences set state='suppressed' where member_id=m.member_id and state='pending' and available_at<=stamp;continue;end if;
  insert into public.nudge_bundles(member_id,day,window_key,created_at) values(m.member_id,day,floor(extract(epoch from stamp)/300)::bigint,stamp) returning id into bid;
  update public.nudge_occurrences set state='bundled',bundle_id=bid where id in(select o.id from public.nudge_occurrences o where o.member_id=m.member_id and o.state='pending' and o.available_at<=stamp and public.nudge_valid(o,stamp) order by priority,available_at,id limit 100);
  payload:=public.nudge_payload(bid,stamp);
  if payload is null then continue;end if;
  select max(expires_at) into expiry from public.nudge_occurrences where bundle_id=bid;
  insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at,next_attempt_at)
  select s.id,'nudge','nudge:'||bid,bid,'nudge',payload,expiry,stamp from public.push_subscriptions s where member_id=m.member_id on conflict(subscription_id,event_key) do nothing;
  get diagnostics n=row_count;total:=total+n;
 end loop;
 -- No unbounded history: terminal delivery evidence is retained for 30 days.
 delete from public.nudge_occurrences where expires_at<stamp-interval '30 days';
 delete from public.push_jobs where source_kind='nudge' and source_id in(select b.id from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id));
 delete from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id);
 delete from public.nudge_quota where day<schedule.day-30;
 return total;
end;$$;

alter function public.push_job_valid(public.push_jobs,uuid) rename to push_legacy_job_valid;
create function public.push_job_valid(j public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when j.source_kind='nudge' then exists(select 1 from public.nudge_bundles b where b.id=j.source_id and b.member_id=p_member and public.nudge_payload(b.id,now()) is not null)
 else public.push_legacy_job_valid(j,p_member) and not ((j.event_key like 'reminder:%' or j.source_kind='practice') and (public.nudge_member_enabled(p_member) or public.nudge_legacy_stage_sent(p_member,j.event_key,j.source_kind))) end;
$$;
alter function public.push_enqueue_reminders() rename to push_enqueue_legacy_reminders;
create function public.push_enqueue_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare legacy integer;smart integer;
begin
 legacy:=public.push_enqueue_legacy_reminders();
 if exists(select 1 from public.nudge_control where id and enabled) then smart:=public.nudge_enqueue();else smart:=0;end if;
 return legacy+smart;
end;$$;
-- Return a freshly rebuilt payload after the final lease/source check.
create function public.push_prepare_delivery(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs;
begin
 if not public.push_can_deliver(p_id,p_token) then return null;end if;
 select * into j from public.push_jobs where id=p_id;
 if j.source_kind='nudge' then return public.nudge_payload(j.source_id,now());end if;
 return j.payload||jsonb_build_object('expiresAt',j.expires_at);
end;$$;

-- Permanent deletion removes source occurrences and empty bundles/jobs too.
create function public.nudge_purge_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='payment_charges' then
  if TG_OP='UPDATE' then if new.status<>'deleted' then return new;end if;end if;
 end if;
 delete from public.nudge_occurrences where source_id=old.id and
 ((TG_TABLE_NAME='payment_charges' and source_kind='payment') or (TG_TABLE_NAME='communication_posts' and source_kind in ('task','announcement')));
 delete from public.push_jobs where source_kind='nudge' and source_id in(select b.id from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id));
 delete from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id);
 if TG_OP='DELETE' then return old;else return new;end if;
end;$$;
create trigger nudge_delete_post after delete on public.communication_posts for each row execute function public.nudge_purge_source();
create trigger nudge_delete_payment after delete or update of status on public.payment_charges for each row execute function public.nudge_purge_source();
create function public.nudge_unlink_deleted_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.kind<>'task' then return old;end if;
 delete from public.nudge_occurrences where source_kind='announcement' and source_id in(select id from public.communication_posts where reminder_task_id=old.id);
 delete from public.communication_audit where action='reminder_saved' and details->>'task'=old.id::text;
 update public.communication_posts set reminder_at=null,reminder_mode=null,reminder_task_id=null,reminder_message='',reminder_revision=reminder_revision+1,version=version+1 where reminder_task_id=old.id;
 return old;
end;$$;
create trigger nudge_unlink_task before delete on public.communication_posts for each row execute function public.nudge_unlink_deleted_task();

revoke all on function public.digest_segment_change(),public.nudge_purge_source(),public.nudge_member_enabled(uuid),public.nudge_valid(public.nudge_occurrences,timestamptz),public.nudge_payload(uuid,timestamptz),public.nudge_enqueue(timestamptz),public.push_legacy_job_valid(public.push_jobs,uuid),public.push_job_valid(public.push_jobs,uuid),public.push_enqueue_legacy_reminders(),public.push_enqueue_reminders(),public.push_prepare_delivery(uuid,uuid),public.save_communication_reminder(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.nudge_unlink_deleted_task() from public,anon,authenticated,service_role;
revoke all on function public.nudge_legacy_stage_sent(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.push_enqueue_reminders(),public.push_prepare_delivery(uuid,uuid),public.nudge_enqueue(timestamptz) to service_role;
grant execute on function public.save_communication_reminder(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid) to authenticated;
commit;
