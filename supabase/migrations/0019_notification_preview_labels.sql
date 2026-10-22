-- Delivery-reason labels and opt-in rollout for daily outstanding-action followups.
begin;
create table public.nudge_fallback_control(
 id boolean primary key default true check(id), enabled boolean not null default false, pilot_members uuid[]
);
insert into public.nudge_fallback_control(id) values(true);
alter table public.nudge_fallback_control enable row level security;
revoke all on public.nudge_fallback_control from public,anon,authenticated,service_role;

create function public.nudge_fallback_enabled(member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.nudge_member_enabled(member) and coalesce((select enabled and (pilot_members is null or member=any(pilot_members)) from public.nudge_fallback_control where id),false);
$$;

-- One normalization for author reminders deferred out of quiet hours.
create function public.nudge_author_scheduled_at(at_time timestamptz) returns timestamptz
language sql immutable set search_path='' as $$
 select case when (at_time at time zone 'America/Chicago')::time<time '09:00'
  then ((at_time at time zone 'America/Chicago')::date+time '09:00') at time zone 'America/Chicago'
 when (at_time at time zone 'America/Chicago')::time>=time '22:00'
  then (((at_time at time zone 'America/Chicago')::date+1)+time '09:00') at time zone 'America/Chicago'
 else at_time end;
$$;

-- Keep the existing deadline/author/practice rules separate from daily fallbacks.
alter function public.nudge_valid(public.nudge_occurrences,timestamptz) rename to nudge_scheduled_valid;
create function public.nudge_fallback_valid(o public.nudge_occurrences,stamp timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select public.nudge_fallback_enabled(o.member_id) and public.push_member_active(o.member_id)
 and o.stage in ('unread-follow-up','incomplete-follow-up')
 and o.available_at<=stamp and o.expires_at>stamp
 and (stamp at time zone 'America/Chicago')::time>=time '18:00'
 and (stamp at time zone 'America/Chicago')::time<time '22:00'
 and exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id
  where p.id=o.source_id and p.kind=o.source_kind and r.member_id=o.member_id
  and r.completed_at is null and p.completed_at is null and p.archived_at is null
  and (p.expires_at is null or p.expires_at>stamp) and p.created_at<=stamp-interval '24 hours'
  and case when p.kind='announcement' then o.stage='unread-follow-up' and p.practice_event_id is null and p.created_at>=stamp-interval '7 days'
    -- A configured author reminder owns its scheduled Chicago day, even before it fires.
    and not (p.reminder_at is not null and (public.nudge_author_scheduled_at(p.reminder_at) at time zone 'America/Chicago')::date=(stamp at time zone 'America/Chicago')::date
     and public.nudge_author_scheduled_at(p.reminder_at)+interval '6 hours'>stamp
     and (p.expires_at is null or p.expires_at>public.nudge_author_scheduled_at(p.reminder_at))
     and (p.reminder_mode in ('acknowledgment','preparation') or (p.reminder_mode='linked-task' and exists(
      select 1 from public.communication_posts task join public.communication_recipients assigned on assigned.post_id=task.id
      where task.id=p.reminder_task_id and assigned.member_id=o.member_id and assigned.completed_at is null
       and task.kind='task' and task.completed_at is null and task.archived_at is null and (task.expires_at is null or task.expires_at>greatest(stamp,public.nudge_author_scheduled_at(p.reminder_at)))))))
   when p.kind='task' then o.stage='incomplete-follow-up' and coalesce(p.due_on::text,'undated')=o.source_token
    and (p.due_on is null or p.due_on<(stamp at time zone 'America/Chicago')::date-1)
   else false end)
 -- A future linked-task author reminder owns the same task action that day.
 and not exists(select 1 from public.communication_posts linked join public.communication_recipients assigned on assigned.post_id=linked.id
  where o.source_kind='task' and linked.kind='announcement' and linked.reminder_task_id=o.source_id
   and linked.reminder_mode='linked-task' and linked.reminder_at is not null and linked.practice_event_id is null
   and assigned.member_id=o.member_id and linked.archived_at is null and (linked.expires_at is null or linked.expires_at>stamp)
   and (public.nudge_author_scheduled_at(linked.reminder_at) at time zone 'America/Chicago')::date=(stamp at time zone 'America/Chicago')::date
   and public.nudge_author_scheduled_at(linked.reminder_at)+interval '6 hours'>stamp
   and (linked.expires_at is null or linked.expires_at>public.nudge_author_scheduled_at(linked.reminder_at))
   and exists(select 1 from public.communication_posts target where target.id=o.source_id
    and (target.expires_at is null or target.expires_at>public.nudge_author_scheduled_at(linked.reminder_at))))
 -- An existing scheduled occurrence for this item owns its local day. Include sent evidence
 -- even if its useful window has elapsed, to avoid another reminder that evening.
 and not exists(select 1 from public.nudge_occurrences prior
  where prior.member_id=o.member_id and ((prior.source_kind=o.source_kind and prior.source_id=o.source_id)
   or (o.source_kind='task' and prior.source_kind='announcement' and exists(select 1 from public.communication_posts linked
    where linked.id=prior.source_id and linked.reminder_mode='linked-task' and linked.reminder_task_id=o.source_id)))
   and prior.stage not in ('unread-follow-up','incomplete-follow-up')
   and (prior.available_at at time zone 'America/Chicago')::date=(stamp at time zone 'America/Chicago')::date
   and (public.nudge_scheduled_valid(prior,stamp) or exists(select 1 from public.push_jobs j
    where j.source_kind='nudge' and j.source_id=prior.bundle_id and j.status in ('pending','sent'))));
$$;
create function public.nudge_valid(o public.nudge_occurrences,stamp timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select case when o.stage in ('unread-follow-up','incomplete-follow-up') then public.nudge_fallback_valid(o,stamp)
 else public.nudge_scheduled_valid(o,stamp) end;
$$;

create function public.nudge_enqueue_fallbacks(stamp timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare day date:=(stamp at time zone 'America/Chicago')::date;
begin
 if (stamp at time zone 'America/Chicago')::time<time '18:00' or (stamp at time zone 'America/Chicago')::time>=time '22:00' then return;end if;
 insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
 select r.member_id,'fallback:'||p.kind||':'||p.id||':'||day,p.kind,p.id,
 case when p.kind='task' then coalesce(p.due_on::text,'undated') else 'unread' end,
 case when p.kind='task' then 'incomplete-follow-up' else 'unread-follow-up' end,3,
 (day+time '18:00') at time zone 'America/Chicago',least((day+time '22:00') at time zone 'America/Chicago',coalesce(p.expires_at,(day+time '22:00') at time zone 'America/Chicago'))
 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id
 where public.nudge_fallback_enabled(r.member_id) and public.push_member_active(r.member_id)
 and r.completed_at is null and p.completed_at is null and p.archived_at is null
 and (p.expires_at is null or p.expires_at>stamp) and p.created_at<=stamp-interval '24 hours'
 and ((p.kind='announcement' and p.practice_event_id is null and p.created_at>=stamp-interval '7 days')
   or (p.kind='task' and (p.due_on is null or p.due_on<day-1)))
 on conflict(member_id,event_key) do nothing;
end;$$;

create or replace function public.nudge_enqueue(stamp timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<schedule>>
declare day date:=(stamp at time zone 'America/Chicago')::date;clock time:=(stamp at time zone 'America/Chicago')::time;
 m record; c record; e jsonb; stage text;scheduled timestamptz;expiry timestamptz;starts timestamptz;local_start timestamp;token text;key text;bid uuid;quota integer;payload jsonb;n integer;total integer:=0;ids uuid[];
begin
 perform public.nudge_enqueue_fallbacks(stamp);
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
 for c in select p.*,r.member_id from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.kind='announcement' and p.practice_event_id is null and p.reminder_at is not null and p.archived_at is null and p.reminder_at>stamp-interval '2 days' and p.reminder_at<=stamp loop
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
 for e in select s.event from public.practice_schedule(stamp) s loop
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
 for m in select distinct member_id from public.nudge_occurrences where state='pending' and available_at<=stamp and public.nudge_valid(nudge_occurrences,stamp) loop
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

-- Build action counts from live, recipient-valid occurrences. Count a linked task only once.
create or replace function public.nudge_payload(p_bundle uuid,stamp timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer;t integer;a integer;c integer;prep integer;practice integer;cutoff timestamptz;path text;
 title text:='Reminder: AKH Mastani';summary text;extra text;preview jsonb;e jsonb;source text;member uuid;
begin
 if (stamp at time zone 'America/Chicago')::time<time '09:00' or (stamp at time zone 'America/Chicago')::time>=time '22:00' then return null;end if;
 select count(*),min(o.expires_at),min(o.member_id::text)::uuid,
 min(case o.source_kind when 'task' then '/todos/'||o.source_id when 'announcement' then '/announcements/'||o.source_id when 'payment' then '/payments/'||o.source_id else '/calendar' end)
 into n,cutoff,member,path from public.nudge_occurrences o where o.bundle_id=p_bundle and public.nudge_valid(o,stamp);
 if n=0 then return null;end if;
 with valid as (select o.*,p.reminder_mode,p.reminder_task_id,p.reminder_message,p.title
  from public.nudge_occurrences o left join public.communication_posts p on p.id=o.source_id
  where o.bundle_id=p_bundle and public.nudge_valid(o,stamp))
 select count(distinct case when source_kind='task' then source_id when source_kind='announcement' and stage='author' and reminder_mode='linked-task' then reminder_task_id end),
 count(distinct source_id) filter(where source_kind='announcement' and (stage='unread-follow-up' or reminder_mode='acknowledgment')),
 count(*) filter(where source_kind='payment'),count(*) filter(where source_kind='announcement' and stage='author' and reminder_mode='preparation'),
 count(*) filter(where source_kind='practice') into t,a,c,prep,practice from valid;
 summary:=concat_ws(' · ',
  case when a>0 then case when n=1 then 'Read & acknowledge this announcement' else 'Acknowledge '||a||' announcement'||case when a=1 then '' else 's' end end end,
  case when t>0 then 'Complete '||t||case when n=1 then ' pending' else '' end||' to-do'||case when t=1 then '' else 's' end end,
  case when c>0 then 'Review '||c||' payment'||case when c=1 then '' else 's' end end,
  case when prep>0 then 'Prepare for '||prep||' announcement'||case when prep=1 then '' else 's' end end);
 if n=1 then
  select 'Reminder: '||p.title into title from public.nudge_occurrences o join public.communication_posts p on p.id=o.source_id
   where o.bundle_id=p_bundle and o.source_kind='announcement' and public.nudge_valid(o,stamp);
  title:=coalesce(title,'Reminder: AKH Mastani');
  path:=coalesce((select '/todos/'||p.reminder_task_id from public.nudge_occurrences o join public.communication_posts p on p.id=o.source_id
   where o.bundle_id=p_bundle and o.source_kind='announcement' and o.stage='author' and p.reminder_mode='linked-task' and public.nudge_valid(o,stamp)),path);
 end if;
 if practice>0 then
  select s.event,s.source into e,source from public.nudge_occurrences o cross join lateral public.practice_schedule(stamp) s
   where o.bundle_id=p_bundle and o.source_kind='practice' and public.nudge_valid(o,stamp)
    and 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=o.source_token order by o.priority,o.available_at,o.id limit 1;
  if e is null then return null;end if;
  preview:=public.practice_preview(e,source,member);
  title:='Reminder: '||(preview->>'title');extra:=preview->>'body';
  if n=1 then path:=preview->>'url';end if;
 elsif n=1 and prep=1 then
  select coalesce(nullif(p.reminder_message,''),'Prepare for this announcement.') into extra
   from public.nudge_occurrences o join public.communication_posts p on p.id=o.source_id
   where o.bundle_id=p_bundle and public.nudge_valid(o,stamp);
  summary:='';
 end if;
 -- Keep configured instructions/author excerpts after the required action, including mixed preparation bundles.
 if practice=0 and not(n=1 and prep=1) then
  select string_agg(coalesce(p.author_name,'Team member')||': '||coalesce(nullif(p.reminder_message,''),btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'))),' · ' order by o.priority,o.available_at,o.id)
   into extra from public.nudge_occurrences o join public.communication_posts p on p.id=o.source_id
   where o.bundle_id=p_bundle and o.source_kind='announcement' and o.stage='author' and public.nudge_valid(o,stamp)
    and (n=1 or p.reminder_mode='preparation');
 elsif practice>0 and prep>0 then
  select concat_ws(' ',extra,string_agg(coalesce(nullif(p.reminder_message,''),btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'))),' · ' order by o.priority,o.available_at,o.id))
   into extra from public.nudge_occurrences o join public.communication_posts p on p.id=o.source_id
   where o.bundle_id=p_bundle and o.stage='author' and p.reminder_mode='preparation' and public.nudge_valid(o,stamp);
 end if;
 return jsonb_build_object('title',left(title,180),'body',left(concat_ws(' ',nullif(summary,'')||case when summary<>'' then '.' else '' end,nullif(extra,'')),240),
 'url',case when n=1 then path else '/home' end,'expiresAt',cutoff);
end;$$;

create or replace function public.push_prepare_delivery(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs;p public.communication_posts;e jsonb;source text;member uuid;preview text;starts timestamptz;edited boolean;
begin
 if not public.push_can_deliver(p_id,p_token) then return null;end if;
 select * into j from public.push_jobs where id=p_id;
 select member_id into member from public.push_subscriptions where id=j.subscription_id;
 if j.source_kind='nudge' then return public.nudge_payload(j.source_id,now());end if;
 if j.source_kind='practice' then
  select s.event,s.source into e,source from public.practice_schedule() s where 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=j.event_key;
  if e is null then return null;end if;
  return j.payload||public.practice_preview(e,source,member)||jsonb_build_object('title','Reminder: '||(public.practice_preview(e,source,member)->>'title'),'expiresAt',j.expires_at);
 end if;
 if j.category='announcement' and j.source_kind='communication' then
  select * into p from public.communication_posts where id=j.source_id and kind='announcement';if not found then return null;end if;
  edited:=exists(select 1 from public.communication_audit audit where audit.post_id=p.id and j.event_key='communication:'||audit.id and audit.action='updated');
  if p.practice_event_id is not null and not edited then
   e:=public.practice_event(p.practice_source,p.practice_event_id);
   -- During the scheduled practice reminder window, the shared event alert carries this message.
   if e is not null then
    starts:=(e->>'start')::timestamptz;
    if starts between now()+interval '30 minutes' and now()+interval '60 minutes' then
     -- Merge only when this device has a real pending shared delivery. A note posted
     -- after the practice reminder was sent must still get its publication alert.
     perform public.push_enqueue_reminders();
     if exists(select 1 from public.push_jobs shared where shared.subscription_id=j.subscription_id and shared.status='pending' and shared.expires_at>now() and public.push_job_valid(shared,member) and
       ((shared.source_kind='practice' and shared.event_key='practice:'||(e->>'id')||':'||(e->>'start')) or
        (shared.source_kind='nudge' and exists(select 1 from public.nudge_occurrences o where o.bundle_id=shared.source_id and o.member_id=member and o.source_kind='practice' and o.source_token='practice:'||(e->>'id')||':'||(e->>'start'))))) then return null;end if;
    end if;
   end if;
  end if;
  preview:=coalesce(p.author_name,'Team member')||': '||btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'));
  return j.payload||jsonb_build_object('title',case when edited then 'Edited announcement: ' else '' end||case when p.practice_event_id is not null then 'Practice: ' else '' end||p.title,'body',case when char_length(preview)>240 then left(preview,239)||'…' else preview end,'expiresAt',j.expires_at);
 end if;
 if j.event_key like 'reminder:%' then
  return j.payload||jsonb_build_object('title','Reminder: AKH Mastani','body',case when j.category='task' then 'Complete your pending to-dos.' when j.category='payment' then 'Review your pending payments.' else j.payload->>'body' end,'expiresAt',j.expires_at);
 end if;
 return j.payload||jsonb_build_object('expiresAt',j.expires_at);
end;$$;

revoke all on function public.nudge_author_scheduled_at(timestamptz),public.nudge_fallback_enabled(uuid),public.nudge_fallback_valid(public.nudge_occurrences,timestamptz),public.nudge_valid(public.nudge_occurrences,timestamptz),public.nudge_scheduled_valid(public.nudge_occurrences,timestamptz),public.nudge_enqueue_fallbacks(timestamptz) from public,anon,authenticated,service_role;
commit;
