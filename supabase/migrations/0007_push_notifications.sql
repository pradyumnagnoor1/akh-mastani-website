-- Private per-device outbox. Notification bodies deliberately contain no team data.
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id) on delete cascade,
 endpoint text not null unique, p256dh text not null, auth text not null, created_at timestamptz not null default now()
);
create table public.push_jobs (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 category text not null, event_key text not null, source_id uuid, source_kind text not null,
 payload jsonb not null, expires_at timestamptz not null default now()+interval '1 day',
 attempts integer not null default 0 check(attempts between 0 and 5), next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, status text not null default 'pending' check(status in ('pending','sent','discarded')),
 unique(subscription_id,event_key)
);
create index push_jobs_due on public.push_jobs(next_attempt_at) where status='pending';
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
revoke all on public.push_subscriptions,public.push_jobs from public,anon,authenticated,service_role;

create function public.push_member_active(p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m join auth.users u on u.id=m.id where m.id=p_member and m.status='active' and m.display_name is not null and m.email=lower(u.email) and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google');
$$;
create function public.push_register_subscription(p_endpoint text,p_p256dh text,p_auth text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.push_subscriptions;
begin
 -- Member lock serializes the cap and deactivation against registration.
 perform 1 from public.members where id=auth.uid() for update;
 if not public.active_member() then raise exception 'Active membership required';end if;
 if p_endpoint is null or char_length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|([a-z0-9-]+[.])*web[.]push[.]apple[.]com|([a-z0-9-]+[.])*updates[.]push[.]services[.]mozilla[.]com)/[^[:space:]#]*$' or (p_endpoint ~ '[[:cntrl:]]' or strpos(p_endpoint,chr(92))>0) then raise exception 'Invalid push endpoint';end if;
 if p_p256dh is null or p_p256dh !~ '^B[A-Za-z0-9_-]{86}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invalid subscription keys';end if;
 if octet_length(decode(translate(p_p256dh,'-_','+/')||'=','base64'))<>65 or get_byte(decode(translate(p_p256dh,'-_','+/')||'=','base64'),0)<>4 or octet_length(decode(translate(p_auth,'-_','+/')||'==','base64'))<>16 then raise exception 'Invalid subscription keys';end if;
 -- Serialize ownership transfers of the same endpoint even when no row exists yet.
 perform pg_advisory_xact_lock(hashtextextended(p_endpoint,0));
 select * into previous from public.push_subscriptions where endpoint=p_endpoint for update;
 if (previous.id is null or previous.member_id<>auth.uid()) and (select count(*) from public.push_subscriptions where member_id=auth.uid())>=5 then raise exception 'Maximum five devices';end if;
 -- A new subscription UUID fences in-flight delivery results after transfers/key rotation.
 if previous.id is not null and (previous.member_id<>auth.uid() or previous.p256dh<>p_p256dh or previous.auth<>p_auth) then
  delete from public.push_subscriptions where id=previous.id; previous.id:=null;
 end if;
 if previous.id is not null then return previous.id;end if;
 insert into public.push_subscriptions(member_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth) returning id into result;
 return result;
end;$$;
create function public.push_unregister_subscription(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.push_subscriptions where endpoint=p_endpoint and member_id=auth.uid();end;$$;
create function public.push_enqueue(p_members uuid[],p_category text,p_key text,p_source uuid,p_kind text,p_url text,p_expiry timestamptz default now()+interval '1 day') returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at)
 select s.id,p_category,p_key,p_source,p_kind,jsonb_build_object('title','AKH Mastani','body',case p_category when 'announcement' then 'A team announcement is available.' when 'task' then 'Check your team to-dos.' when 'payment' then 'Check your payments for an update.' when 'membership' then 'Your membership has been approved.' when 'segment' then 'Your set design has an update.' else 'Practice is coming up. Check the calendar.' end,'url',p_url),p_expiry
 from public.push_subscriptions s where s.member_id=any(p_members) and public.push_member_active(s.member_id)
 on conflict(subscription_id,event_key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
create function public.push_communication_event() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.communication_posts; ids uuid[]; prior jsonb;
begin
 if new.post_id is null or new.action not in ('created','updated','reopen') then return new;end if;
 select * into p from public.communication_posts where id=new.post_id and archived_at is null;
 if not found then return new;end if;
 if new.action='updated' then
  select details into prior from public.communication_audit where post_id=new.post_id and id<new.id and action in ('created','updated') order by id desc limit 1;
  if prior is not null and prior->'title'=new.details->'title' and prior->'body'=new.details->'body' and prior->'due_on'=new.details->'due_on' then return new;end if;
 end if;
 select array_agg(r.member_id) into ids from public.communication_recipients r where r.post_id=p.id
 and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null))
 and (new.action<>'reopen' or new.details->>'recipient_id' is null or r.member_id=(new.details->>'recipient_id')::uuid);
 perform public.push_enqueue(ids,p.kind,'communication:'||new.id,p.id,'communication',(case p.kind when 'task' then '/todos/' else '/announcements/' end)||p.id::text);
 return new;
end;$$;
create trigger push_communication after insert on public.communication_audit for each row execute function public.push_communication_event();
create function public.push_payment_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or (old.status is distinct from new.status and new.status<>'reported') then
  perform public.push_enqueue(array[new.member_id],'payment','payment:'||new.id||':'||new.version,new.id,'payment','/payments/'||new.id::text);
 end if;return new;
end;$$;
create trigger push_payment after insert or update on public.payment_charges for each row execute function public.push_payment_event();
create function public.push_membership_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'active' then delete from public.push_subscriptions where member_id=new.id;
 elsif old.status is distinct from new.status then perform public.push_enqueue(array[new.id],'membership','membership:'||new.id||':'||gen_random_uuid(),new.id,'membership','/home');end if;
 return new;
end;$$;
create trigger push_membership after update of status on public.members for each row execute function public.push_membership_event();
-- The segment audit is inserted only after the final assignments are saved.
create function public.push_segment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb; ids uuid[];
begin
 if new.action not in ('created','updated') then return new;end if;
 select details into prior from public.segment_audit where segment_id=new.segment_id and id<new.id and action in ('created','updated') order by id desc limit 1;
 if prior is not null and (prior->'members') @> (new.details->'members') and (new.details->'members') @> (prior->'members') and prior->'document_path'=new.details->'document_path' then return new;end if;
 select array_agg(member_id) into ids from public.segment_members where segment_id=new.segment_id;
 perform public.push_enqueue(ids,'segment','segment:'||new.id,new.segment_id,'segment','/segments/'||new.segment_id::text);return new;
end;$$;
create trigger push_segment after insert on public.segment_audit for each row execute function public.push_segment_event();

create function public.push_calendar_current(p_source text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.calendar_connection c where c.id and c.calendar_id is not null and c.client_id is not null and c.encrypted_token is not null and p_source=encode(sha256(convert_to('connected:'||c.version::text||':'||c.client_id||':'||c.calendar_id,'UTF8')),'hex'));
$$;

-- Revalidate the durable recipient relationship before leasing. Never infer a new audience.
create function public.push_job_valid(p_job public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.push_member_active(p_member) and case p_job.source_kind
 when 'communication' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=p_job.source_id and r.member_id=p_member and p.archived_at is null and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null)))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=p_job.source_id and c.member_id=p_member and (p_job.event_key not like 'reminder:%' or c.status='unpaid'))
 when 'segment' then exists(select 1 from public.segments s join public.segment_members m on m.segment_id=s.id where s.id=p_job.source_id and s.archived_at is null and m.member_id=p_member)
 when 'membership' then p_job.source_id=p_member
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=p_job.event_key and e->>'allDay'='false' and (e->>'start')::timestamptz>now()))
 else false end;
$$;
create function public.push_claim_jobs(p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs; s public.push_subscriptions; token uuid; output jsonb:='[]'; stamp timestamptz:=clock_timestamp();
begin
 delete from public.push_jobs where status<>'pending' and expires_at<stamp-interval '30 days';
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Limit must be 1–50';end if;
 for j in select * from public.push_jobs where status='pending' and next_attempt_at<=stamp and (lease_until is null or lease_until<=stamp) order by next_attempt_at,id limit p_limit for update skip locked loop
  select * into s from public.push_subscriptions where id=j.subscription_id for share;
  if s.id is null or j.expires_at<=stamp or j.attempts>=5 or not public.push_job_valid(j,s.member_id) then
   update public.push_jobs set status='discarded',lease_token=null,lease_until=null where id=j.id;continue;
  end if;
  token:=gen_random_uuid();
  update public.push_jobs set attempts=attempts+1,lease_token=token,lease_until=stamp+interval '60 seconds' where id=j.id;
  output:=output||jsonb_build_array(jsonb_build_object('id',j.id,'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'payload',j.payload||jsonb_build_object('tag',j.id::text),'lease_token',token));
 end loop;return output;
end;$$;
create function public.push_finish_job(p_id uuid,p_token uuid,p_result text) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.push_jobs;
begin
 if p_result is null or p_result not in ('sent','retry','expired','failed') then raise exception 'Invalid delivery result';end if;
 select * into j from public.push_jobs where id=p_id and status='pending' and lease_token=p_token and lease_until>clock_timestamp() for update;
 if not found then return false;end if;
 if p_result='expired' then delete from public.push_subscriptions where id=j.subscription_id;return true;end if;
 update public.push_jobs set status=case when p_result='sent' then 'sent' when p_result='retry' and attempts<5 and expires_at>clock_timestamp() then 'pending' else 'discarded' end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,j.attempts-1)::integer)),lease_token=null,lease_until=null where id=p_id;
 return true;
end;$$;
create function public.push_enqueue_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare p record; e jsonb; ids uuid[]; total integer:=0; day date:=(now() at time zone 'America/Chicago')::date; starts timestamptz;
begin
 for p in select c.id,array_agg(r.member_id) ids from public.communication_posts c join public.communication_recipients r on r.post_id=c.id where c.kind='task' and c.archived_at is null and c.completed_at is null and r.completed_at is null and c.due_on=day and (now() at time zone 'America/Chicago')::time>=time '09:00' group by c.id loop
  total:=total+public.push_enqueue(p.ids,'task','reminder:task:'||p.id||':'||day,p.id,'communication','/todos/'||p.id::text,((day+1)::timestamp at time zone 'America/Chicago'));
 end loop;
 for p in select id,member_id from public.payment_charges where due_on=day and status='unpaid' and (now() at time zone 'America/Chicago')::time>=time '09:00' loop
  total:=total+public.push_enqueue(array[p.member_id],'payment','reminder:payment:'||p.id||':'||day,p.id,'payment','/payments/'||p.id::text,((day+1)::timestamp at time zone 'America/Chicago'));
 end loop;
 select array_agg(id) into ids from public.members where status='active';
 for e in select value from public.calendar_snapshot c cross join lateral jsonb_array_elements(c.events) where c.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) loop
  if e->>'allDay'<>'false' then continue;end if;
  begin starts:=(e->>'start')::timestamptz;exception when others then continue;end;
  if starts between now()+interval '30 minutes' and now()+interval '60 minutes' then
   total:=total+public.push_enqueue(ids,'practice','practice:'||(e->>'id')||':'||(e->>'start'),null,'practice','/calendar',starts);
  end if;
 end loop;return total;
end;$$;
revoke all on function public.push_calendar_current(text),public.push_member_active(uuid),public.push_register_subscription(text,text,text),public.push_unregister_subscription(text),public.push_enqueue(uuid[],text,text,uuid,text,text,timestamptz),public.push_communication_event(),public.push_payment_event(),public.push_membership_event(),public.push_segment_event(),public.push_job_valid(public.push_jobs,uuid),public.push_claim_jobs(integer),public.push_finish_job(uuid,uuid,text),public.push_enqueue_reminders() from public,anon,authenticated,service_role;
grant execute on function public.push_register_subscription(text,text,text),public.push_unregister_subscription(text) to authenticated;
grant execute on function public.push_claim_jobs(integer),public.push_finish_job(uuid,uuid,text),public.push_enqueue_reminders() to service_role;

-- Device-cookie cleanup and immediate pre-send fencing are narrow RPCs.
create function public.push_unregister_device(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.push_subscriptions where id=p_id and member_id=auth.uid();end;$$;
create function public.push_can_deliver(p_id uuid,p_token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.push_jobs j join public.push_subscriptions s on s.id=j.subscription_id where j.id=p_id and j.lease_token=p_token and j.status='pending' and j.lease_until>now() and j.expires_at>now() and public.push_job_valid(j,s.member_id));
$$;
create function public.push_calendar_actor() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.members where public.push_member_active(id) order by is_admin desc,id limit 1;
$$;
revoke all on function public.push_unregister_device(uuid),public.push_can_deliver(uuid,uuid),public.push_calendar_actor() from public,anon,authenticated,service_role;
grant execute on function public.push_unregister_device(uuid) to authenticated;
grant execute on function public.push_can_deliver(uuid,uuid),public.push_calendar_actor() to service_role;

-- Return only whether the caller owns this currently active device, never its keys.
create function public.push_device_registered(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.push_subscriptions where id=p_id and member_id=auth.uid());
$$;
revoke all on function public.push_device_registered(uuid) from public,anon,authenticated,service_role;
grant execute on function public.push_device_registered(uuid) to authenticated;
