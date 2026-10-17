-- Website-only practices share the same canonical reminder flow as Google practices.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0015',0));
create table public.custom_practices(
 id uuid primary key,title text not null check(char_length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'),
 starts_at timestamptz not null,ends_at timestamptz not null,location text not null check(char_length(btrim(location)) between 1 and 200 and location !~ '[[:cntrl:]]'),
 version integer not null default 1 check(version>0),created_by uuid references public.members(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create index custom_practices_start on public.custom_practices(starts_at);
create table public.custom_practice_audit(id bigint generated always as identity primary key,practice_id uuid not null references public.custom_practices(id) on delete cascade,actor_id uuid,action text not null,details jsonb not null,created_at timestamptz not null default now());
alter table public.custom_practices enable row level security;
alter table public.custom_practice_audit enable row level security;
revoke all on public.custom_practices,public.custom_practice_audit from public,anon,authenticated,service_role;
grant select on public.custom_practices,public.custom_practice_audit to authenticated;
create policy custom_practice_read on public.custom_practices for select to authenticated using(public.active_member());
create policy custom_practice_audit_read on public.custom_practice_audit for select to authenticated using(public.admin_member());
create function public.custom_practice_event(p public.custom_practices) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','custom:'||p.id,'title',p.title,'start',to_char(p.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'end',to_char(p.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'allDay',false,'location',p.location,'url',null,'recurringEventId',null,'originalStart',null,'source','custom','version',p.version);
$$;
create function public.practice_schedule(stamp timestamptz default now()) returns table(source text,event jsonb) language sql stable security definer set search_path='' as $$
 select s.source_fingerprint,e from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) e where s.last_success_at>stamp-interval '15 minutes' and public.push_calendar_current(s.source_fingerprint)
 union all select 'custom',public.custom_practice_event(c) from public.custom_practices c;
$$;
create function public.save_custom_practice(target_id uuid,expected_version integer,practice_title text,starts timestamptz,ends timestamptz,practice_location text) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.custom_practices;
begin
 if not public.admin_member() then raise exception 'Management access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid practice version';end if;
 select * into prior from public.custom_practices where id=target_id for update;
 if (prior.id is null and expected_version<>0) or (prior.id is not null and prior.version<>expected_version) then raise exception 'Practice changed. Refresh';end if;
 if practice_title is null or char_length(btrim(practice_title)) not between 1 and 160 or practice_title ~ '[[:cntrl:]]' or practice_location is null or char_length(btrim(practice_location)) not between 1 and 200 or practice_location ~ '[[:cntrl:]]' then raise exception 'Enter a practice name and location';end if;
 if starts is null or ends is null or ends<=starts or ends>starts+interval '24 hours' or starts>now()+interval '366 days' then raise exception 'Choose a valid practice time of up to 24 hours';end if;
 if (prior.id is null or prior.starts_at is distinct from starts) and starts<=now() then raise exception 'Choose an upcoming practice';end if;
 if prior.id is null then insert into public.custom_practices(id,title,starts_at,ends_at,location,created_by) values(target_id,btrim(practice_title),starts,ends,btrim(practice_location),auth.uid());
 else update public.custom_practices set title=btrim(practice_title),starts_at=starts,ends_at=ends,location=btrim(practice_location),version=version+1,updated_at=now() where id=target_id;end if;
 insert into public.custom_practice_audit(practice_id,actor_id,action,details) values(target_id,auth.uid(),case when prior.id is null then 'created' else 'updated' end,jsonb_build_object('title',btrim(practice_title),'start',starts,'end',ends,'location',btrim(practice_location)));
 return target_id;
end;$$;


create or replace function public.save_announcement(
 target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text,
 reminder_time timestamptz,reminder_type text,reminder_text text,linked_task uuid,posting_role text,practice_id text,calendar_source text
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.communication_posts;e jsonb;source text;
begin
 if not public.communication_manager(target_id,post_kind) then raise exception 'Announcement management access required';end if;
 select * into prior from public.communication_posts where id=target_id for update;
 if prior.id is not null and prior.version<>expected_version then raise exception 'Announcement changed. Refresh';end if;
 if prior.id is null then
  if posting_role is not null and not exists(select 1 from public.members where id=auth.uid() and posting_role=any(exec_roles)) then raise exception 'Choose one of your assigned exec roles';end if;
  if public.exec_member() and posting_role is null and post_kind='announcement' then raise exception 'Choose a posting role';end if;
 elsif posting_role is distinct from prior.author_exec_role then raise exception 'Original posting role cannot change';end if;
 if practice_id is not null then
  if post_kind<>'announcement' then raise exception 'Only announcements can link a practice';end if;
  select s.source,s.event into source,e from public.practice_schedule() s where s.source=calendar_source and public.practice_identity(s.event)=practice_id and s.event->>'allDay'='false';
  if e is null then
   if prior.practice_event_id=practice_id and prior.practice_source=calendar_source then e:=prior.practice_snapshot;source:=prior.practice_source;
   else raise exception 'Practice unavailable. Refresh the calendar and choose a practice';end if;
  elsif prior.practice_event_id is distinct from practice_id or prior.practice_source is distinct from calendar_source then
   if (e->>'start')::timestamptz<=now() then raise exception 'Choose an upcoming practice';end if;
  end if;
  reminder_time:=null;reminder_type:=null;reminder_text:='';linked_task:=null;
 end if;
 perform public.save_communication_reminder(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date,expiration_date,image_object,image_alt,reminder_time,reminder_type,reminder_text,linked_task);
 update public.communication_posts set author_exec_role=posting_role,practice_event_id=practice_id,practice_source=source,practice_snapshot=e where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'practice_link_saved',jsonb_build_object('practice',practice_id,'source',source,'posting_role',posting_role));
 return target_id;
end;$$;

create or replace function public.save_announcement_custom(
 target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text,
 reminder_time timestamptz,reminder_type text,reminder_text text,linked_task uuid,posting_role text,practice_id text,calendar_source text
,custom_id uuid,custom_version integer,custom_title text,custom_start timestamptz,custom_end timestamptz,custom_location text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if post_kind is distinct from 'announcement' then raise exception 'Only announcements can link a practice';end if;
 perform public.save_custom_practice(custom_id,custom_version,custom_title,custom_start,custom_end,custom_location);
 return public.save_announcement(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date,expiration_date,image_object,image_alt,null,null,'',null,posting_role,'custom:'||custom_id,'custom');
end;$$;


create or replace function public.practice_event(p_source text,p_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select s.event from public.practice_schedule() s where s.source=p_source and public.practice_identity(s.event)=p_id limit 1;
$$;

create or replace function public.nudge_valid(o public.nudge_occurrences,stamp timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select public.nudge_member_enabled(o.member_id) and public.push_member_active(o.member_id) and o.expires_at>stamp and case o.source_kind
 when 'task' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='task' and p.due_on::text=o.source_token and r.member_id=o.member_id and r.completed_at is null and p.completed_at is null and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=o.source_id and c.member_id=o.member_id and c.due_on::text=o.source_token and c.status='unpaid')
 when 'announcement' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='announcement' and p.practice_event_id is null and p.reminder_revision::text=o.source_token and p.reminder_at is not null and r.member_id=o.member_id and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp) and
  case p.reminder_mode when 'preparation' then true when 'acknowledgment' then r.completed_at is null when 'linked-task' then exists(select 1 from public.communication_posts t join public.communication_recipients tr on tr.post_id=t.id where t.id=p.reminder_task_id and t.kind='task' and tr.member_id=o.member_id and tr.completed_at is null and t.completed_at is null and t.archived_at is null and (t.expires_at is null or t.expires_at>stamp)) else false end)
 when 'practice' then exists(select 1 from public.practice_schedule(stamp) s where 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=o.source_token and s.event->>'allDay'='false' and (s.event->>'start')::timestamptz>stamp)
 else false end;
$$;

create or replace function public.nudge_enqueue(stamp timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
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

create or replace function public.push_enqueue_legacy_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare p record; e jsonb; ids uuid[]; total integer:=0; day date:=(now() at time zone 'America/Chicago')::date; starts timestamptz;
begin
 for p in select c.id,array_agg(r.member_id) ids from public.communication_posts c join public.communication_recipients r on r.post_id=c.id where c.kind='task' and c.archived_at is null and c.completed_at is null and r.completed_at is null and c.due_on=day and (now() at time zone 'America/Chicago')::time>=time '09:00' group by c.id loop
  total:=total+public.push_enqueue(p.ids,'task','reminder:task:'||p.id||':'||day,p.id,'communication','/todos/'||p.id::text,((day+1)::timestamp at time zone 'America/Chicago'));
 end loop;
 for p in select id,member_id from public.payment_charges where due_on=day and status='unpaid' and (now() at time zone 'America/Chicago')::time>=time '09:00' loop
  total:=total+public.push_enqueue(array[p.member_id],'payment','reminder:payment:'||p.id||':'||day,p.id,'payment','/payments/'||p.id::text,((day+1)::timestamp at time zone 'America/Chicago'));
 end loop;
 select array_agg(id) into ids from public.members where status='active';
 for e in select s.event from public.practice_schedule() s loop
  if e->>'allDay'<>'false' then continue;end if;
  begin starts:=(e->>'start')::timestamptz;exception when others then continue;end;
  if starts between now()+interval '30 minutes' and now()+interval '60 minutes' then
   total:=total+public.push_enqueue(ids,'practice','practice:'||(e->>'id')||':'||(e->>'start'),null,'practice','/calendar',starts);
  end if;
 end loop;return total;
end;$$;

create or replace function public.nudge_payload(p_bundle uuid,stamp timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;o public.nudge_occurrences;p public.communication_posts;e jsonb;source text;total integer;preview jsonb;
begin
 payload:=public.nudge_base_payload(p_bundle,stamp);if payload is null then return null;end if;
 select count(*) into total from public.nudge_occurrences x where bundle_id=p_bundle and public.nudge_valid(x,stamp);
 select * into o from public.nudge_occurrences x where bundle_id=p_bundle and public.nudge_valid(x,stamp) order by case when source_kind='practice' then 0 else 1 end,priority,available_at,id limit 1;
 if o.source_kind='practice' then
  select s.event,s.source into e,source from public.practice_schedule(stamp) s where 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=o.source_token;
  if e is null then return null;end if;
  preview:=public.practice_preview(e,source,o.member_id);
  if total>1 then preview:=preview||jsonb_build_object('body',left(preview->>'body',180)||' · More reminders in your Today plan.','url','/home');end if;
  return payload||preview;
 elsif total=1 and o.source_kind='announcement' then
  select * into p from public.communication_posts where id=o.source_id;
  return payload||jsonb_build_object('title',p.title,'body',left(coalesce(p.author_name,'Team member')||': '||coalesce(nullif(p.reminder_message,''),btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'))),240));
 end if;
 return payload;
end;$$;

create or replace function public.push_prepare_delivery(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs;p public.communication_posts;e jsonb;source text;member uuid;preview text;starts timestamptz;
begin
 if not public.push_can_deliver(p_id,p_token) then return null;end if;
 select * into j from public.push_jobs where id=p_id;
 select member_id into member from public.push_subscriptions where id=j.subscription_id;
 if j.source_kind='nudge' then return public.nudge_payload(j.source_id,now());end if;
 if j.source_kind='practice' then
  select s.event,s.source into e,source from public.practice_schedule() s where 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=j.event_key;
  if e is null then return null;end if;
  return j.payload||public.practice_preview(e,source,member)||jsonb_build_object('expiresAt',j.expires_at);
 end if;
 if j.category='announcement' and j.source_kind='communication' then
  select * into p from public.communication_posts where id=j.source_id and kind='announcement';if not found then return null;end if;
  if p.practice_event_id is not null then
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
  return j.payload||jsonb_build_object('title',case when p.practice_event_id is not null then 'Practice: ' else '' end||p.title,'body',case when char_length(preview)>240 then left(preview,239)||'…' else preview end,'expiresAt',j.expires_at);
 end if;
 return j.payload||jsonb_build_object('expiresAt',j.expires_at);
end;$$;

create or replace function public.push_legacy_job_valid(p_job public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.push_member_active(p_member) and case p_job.source_kind
 when 'communication' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=p_job.source_id and r.member_id=p_member and p.archived_at is null and (p.expires_at is null or p.expires_at>now()) and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null)))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=p_job.source_id and c.status<>'deleted' and c.member_id=p_member and (p_job.event_key not like 'reminder:%' or c.status='unpaid'))
 when 'segment' then exists(select 1 from public.segments s join public.segment_members m on m.segment_id=s.id where s.id=p_job.source_id and s.archived_at is null and m.member_id=p_member)
 when 'featured' then exists(select 1 from public.featured_events e where e.id=p_job.source_id and e.deleted_at is null and (e.expires_at is null or e.expires_at>now()))
 when 'membership' then p_job.source_id=p_member
 when 'practice' then exists(select 1 from public.practice_schedule() s where 'practice:'||(s.event->>'id')||':'||(s.event->>'start')=p_job.event_key and s.event->>'allDay'='false' and (s.event->>'start')::timestamptz>now())
 else false end;
$$;

-- Explicit custom event deletion removes its audit, snapshot history and pending jobs.
alter table public.communication_posts drop constraint practice_link_complete;
alter table public.communication_posts add constraint practice_link_complete check(
 (practice_event_id is null and practice_source is null and practice_snapshot is null) or
 (kind='announcement' and practice_event_id is not null and practice_source is not null));
create function public.delete_custom_practice(target_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare affected_bundles uuid[];
begin
 if not public.admin_member() then raise exception 'Management access required';end if;
 perform 1 from public.custom_practices where id=target_id and version=expected_version for update;
 if not found then raise exception 'Practice changed. Refresh';end if;
 delete from public.push_jobs where source_kind='communication' and source_id in(select id from public.communication_posts where practice_source='custom' and practice_event_id='custom:'||target_id);
 -- Expired posts are immutable through normal saves; deletion only removes their private event snapshot.
 delete from public.communication_posts where practice_source='custom' and practice_event_id='custom:'||target_id and expires_at<=now();
 update public.communication_posts set practice_snapshot=null,version=version+1 where practice_source='custom' and practice_event_id='custom:'||target_id;
 select array_agg(distinct bundle_id) into affected_bundles from public.nudge_occurrences where source_kind='practice' and source_token like 'practice:custom:'||target_id||':%';
 delete from public.nudge_occurrences where source_kind='practice' and source_token like 'practice:custom:'||target_id||':%';
 -- Surviving mixed bundles retain other reminders, but no deleted practice details.
 update public.push_jobs set payload=jsonb_build_object('title','AKH Mastani','body','Open your Today plan.','url','/home') where source_kind='nudge' and source_id=any(affected_bundles);
 delete from public.push_jobs where source_kind='practice' and event_key like 'practice:custom:'||target_id||':%';
 delete from public.push_jobs where source_kind='nudge' and source_id in(select b.id from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id));
 delete from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id);
 delete from public.custom_practices where id=target_id;
end;$$;
revoke all on function public.custom_practice_event(public.custom_practices),public.practice_schedule(timestamptz),public.save_custom_practice(uuid,integer,text,timestamptz,timestamptz,text),public.delete_custom_practice(uuid,integer),public.save_announcement_custom(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid,text,text,text,uuid,integer,text,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.save_custom_practice(uuid,integer,text,timestamptz,timestamptz,text),public.delete_custom_practice(uuid,integer),public.save_announcement_custom(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid,text,text,text,uuid,integer,text,timestamptz,timestamptz,text) to authenticated;
commit;
