-- Run this complete file. Transactional and resumable for known0008 schema states.
-- Never replay older behavior after permanent-deletion migration0009 has started.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0008',0));
do $$
begin
 if to_regclass('public.formation_cleanup') is not null
 or to_regprocedure('public.delete_team_item(uuid,integer,text)') is not null
 --0009 first drops/replaces this FK, before creating either later marker.
 or (to_regclass('public.featured_event_audit') is not null and not exists(
  select 1 from pg_constraint where conrelid=to_regclass('public.featured_event_audit')
  and conname='featured_event_audit_event_id_fkey' and contype='f' and confdeltype='a'
 )) then
  raise exception 'Migration0009 is already present or has started. Do not rerun0008; its older behavior would replace permanent deletion rules.';
 end if;
end;$$;

-- Additive management operations; financial records and recipient history remain intact.
alter table public.payment_charges drop constraint if exists payment_charges_status_check;
alter table public.payment_charges add constraint payment_charges_status_check check(status in ('unpaid','reported','verified','waived','deleted'));

create or replace function public.manage_payment_charge(target_id uuid,expected_version integer,operation text,amount integer,charge_reason text,payment_instructions text,due_date date,note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.payment_charges; before_data jsonb; clean_note text:=nullif(btrim(note),'');
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if operation is null or operation not in ('update','delete') then raise exception 'Invalid operation';end if;
 select * into c from public.payment_charges where id=target_id for update;
 if c.id is null or expected_version is null or c.version<>expected_version or c.status='deleted' then raise exception 'Payment changed. Refresh';end if;
 if clean_note is null or char_length(clean_note)>1000 then raise exception 'Explanation required, maximum 1000 characters';end if;
 before_data:=to_jsonb(c);
 if operation='update' then
  if c.status not in ('unpaid','reported') then raise exception 'Settled charges cannot be edited';end if;
  if amount is null or amount not between 1 and 1000000 or charge_reason is null or char_length(btrim(charge_reason)) not between 1 and 160 or charge_reason ~ '[[:cntrl:]]' or payment_instructions is null or char_length(btrim(payment_instructions)) not between 1 and 3000 then raise exception 'Invalid charge amount, reason or instructions';end if;
  if c.amount_cents=amount and c.reason=btrim(charge_reason) and c.instructions=btrim(payment_instructions) and c.due_on is not distinct from due_date then return;end if;
  update public.payment_charges set amount_cents=amount,reason=btrim(charge_reason),instructions=btrim(payment_instructions),due_on=due_date,status='unpaid',reported_at=null,report_note=null,review_note=clean_note,version=version+1 where id=target_id;
 else
  update public.payment_charges set status='deleted',review_note=clean_note,version=version+1 where id=target_id;
 end if;
 insert into public.payment_audit(charge_id,actor_id,action,note,details) select target_id,auth.uid(),operation,clean_note,jsonb_build_object('before',before_data,'after',to_jsonb(p)) from public.payment_charges p where id=target_id;
end;$$;
revoke all on function public.manage_payment_charge(uuid,integer,text,integer,text,text,date,text) from public,anon,authenticated;
grant execute on function public.manage_payment_charge(uuid,integer,text,integer,text,text,date,text) to authenticated;

create table if not exists public.featured_events (
 id uuid primary key, title text not null check(char_length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'),
 description text not null default '' check(char_length(description)<=3000), event_date date not null,
 start_time time, location text not null default '' check(char_length(location)<=200 and location !~ '[[:cntrl:]]'),
 event_link text not null default '' check(char_length(event_link)<=2048),
 version integer not null default 1 check(version>0), deleted_at timestamptz,
 created_by uuid not null references public.members(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists featured_events_date on public.featured_events(event_date,id) where deleted_at is null;
create table if not exists public.featured_event_audit(id bigint generated always as identity primary key,event_id uuid not null references public.featured_events(id),actor_id uuid not null,action text not null,details jsonb not null,created_at timestamptz not null default now());
alter table public.featured_events enable row level security;
alter table public.featured_event_audit enable row level security;
revoke all on public.featured_events,public.featured_event_audit from public,anon,authenticated;
grant select on public.featured_events,public.featured_event_audit to authenticated;
drop policy if exists featured_read on public.featured_events;
create policy featured_read on public.featured_events for select to authenticated using(public.admin_member() or (public.active_member() and deleted_at is null));
drop policy if exists featured_audit_read on public.featured_event_audit;
create policy featured_audit_read on public.featured_event_audit for select to authenticated using(public.admin_member());

create or replace function public.save_featured_event(target_id uuid,expected_version integer,event_title text,event_description text,event_day date,event_time time,event_location text,event_url text) returns void language plpgsql security definer set search_path='' as $$
declare e public.featured_events; before_data jsonb;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 or event_title is null or char_length(btrim(event_title)) not between 1 and 160 or event_title ~ '[[:cntrl:]]' or event_description is null or char_length(event_description)>3000 or event_day is null or not isfinite(event_day) or event_day not between date '2000-01-01' and date '2100-12-31' or (event_time is not null and event_time>=time '24:00') or event_location is null or char_length(btrim(event_location))>200 or event_location ~ '[[:cntrl:]]' or event_url is null or char_length(event_url)>2048 or (event_url<>'' and (event_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#]|$)' or event_url ~ '[[:space:]\\]')) then raise exception 'Invalid featured event details';end if;
 if expected_version=0 then
  insert into public.featured_events(id,title,description,event_date,start_time,location,event_link,created_by) values(target_id,btrim(event_title),btrim(event_description),event_day,event_time,btrim(event_location),event_url,auth.uid());
 else
  select * into e from public.featured_events where id=target_id for update;
  if e.id is null or e.version<>expected_version or e.deleted_at is not null then raise exception 'Event changed. Refresh';end if;
  before_data:=to_jsonb(e);
  if e.title=btrim(event_title) and e.description=btrim(event_description) and e.event_date=event_day and e.start_time is not distinct from event_time and e.location=btrim(event_location) and e.event_link=event_url then return;end if;
  update public.featured_events set title=btrim(event_title),description=btrim(event_description),event_date=event_day,start_time=event_time,location=btrim(event_location),event_link=event_url,version=version+1,updated_at=now() where id=target_id;
 end if;
 insert into public.featured_event_audit(event_id,actor_id,action,details) select target_id,auth.uid(),case when expected_version=0 then 'created' else 'updated' end,jsonb_build_object('before',before_data,'after',to_jsonb(f)) from public.featured_events f where id=target_id;
end;$$;
create or replace function public.delete_featured_event(target_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.featured_events;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 select * into e from public.featured_events where id=target_id for update;
 if e.id is null or expected_version is null or e.version<>expected_version or e.deleted_at is not null then raise exception 'Event changed. Refresh';end if;
 update public.featured_events set deleted_at=now(),version=version+1,updated_at=now() where id=target_id;
 insert into public.featured_event_audit(event_id,actor_id,action,details) values(target_id,auth.uid(),'deleted',to_jsonb(e));
end;$$;
revoke all on function public.save_featured_event(uuid,integer,text,text,date,time,text,text),public.delete_featured_event(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_featured_event(uuid,integer,text,text,date,time,text,text),public.delete_featured_event(uuid,integer) to authenticated;

-- Announcement titles are explicitly authorized for lock-screen display; bodies and payment details remain generic.
create or replace function public.push_enqueue(p_members uuid[],p_category text,p_key text,p_source uuid,p_kind text,p_url text,p_expiry timestamptz default now()+interval '1 day') returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at)
 select s.id,p_category,p_key,p_source,p_kind,jsonb_build_object('title',case when p_category='announcement' and p_kind='communication' then coalesce((select title from public.communication_posts where id=p_source),'AKH Mastani') else 'AKH Mastani' end,'body',case p_category when 'announcement' then 'A team announcement is available.' when 'task' then 'Check your team to-dos.' when 'payment' then 'Check your payments for an update.' when 'membership' then 'Your membership has been approved.' when 'segment' then 'Your set design has an update.' when 'featured' then 'A featured event has an update. Check the calendar.' else 'Practice is coming up. Check the calendar.' end,'url',p_url),p_expiry
 from public.push_subscriptions s where s.member_id=any(p_members) and public.push_member_active(s.member_id)
 on conflict(subscription_id,event_key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
create or replace function public.push_job_valid(p_job public.push_jobs,p_member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.push_member_active(p_member) and case p_job.source_kind
 when 'communication' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=p_job.source_id and r.member_id=p_member and p.archived_at is null and (p.kind<>'task' or (p.completed_at is null and r.completed_at is null)))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=p_job.source_id and c.member_id=p_member and (p_job.event_key not like 'reminder:%' or c.status='unpaid'))
 when 'segment' then exists(select 1 from public.segments s join public.segment_members m on m.segment_id=s.id where s.id=p_job.source_id and s.archived_at is null and m.member_id=p_member)
 when 'featured' then exists(select 1 from public.featured_events e where e.id=p_job.source_id and e.deleted_at is null)
 when 'membership' then p_job.source_id=p_member
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=p_job.event_key and e->>'allDay'='false' and (e->>'start')::timestamptz>now()))
 else false end;
$$;
create or replace function public.push_payment_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or (new.status<>'reported' and (old.status is distinct from new.status or old.amount_cents is distinct from new.amount_cents or old.reason is distinct from new.reason or old.instructions is distinct from new.instructions or old.due_on is distinct from new.due_on)) then
  perform public.push_enqueue(array[new.member_id],'payment','payment:'||new.id||':'||new.version,new.id,'payment','/payments/'||new.id::text);
 end if;return new;
end;$$;

create or replace function public.push_featured_event() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if new.deleted_at is not null then return new;end if;
 select array_agg(id) into ids from public.members where status='active';
 perform public.push_enqueue(ids,'featured','featured:'||new.id||':'||new.version,new.id,'featured','/calendar');
 return new;
end;$$;
drop trigger if exists push_featured on public.featured_events;
create trigger push_featured after insert or update on public.featured_events for each row execute function public.push_featured_event();
revoke all on function public.push_featured_event() from public,anon,authenticated,service_role;
-- Bring already queued announcement jobs onto the same title-display policy.
update public.push_jobs j set payload=j.payload||jsonb_build_object('title',p.title) from public.communication_posts p where j.source_id=p.id and j.category='announcement' and j.source_kind='communication' and j.status='pending';

commit;
