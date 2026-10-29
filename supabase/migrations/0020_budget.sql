-- Budget is separate from dancer payment charges. All money is integer USD cents.
begin;
create table public.budget_owners(member_id uuid primary key references public.members(id));
-- The owner is granted by verified, permanent account identity, never by a
-- client-supplied name or first-signup order. Non-matching environments stay empty.
insert into public.budget_owners(member_id)
 select m.id from public.members m join auth.users u on u.id=m.id
 where m.email='pradyumnagnoor@tamu.edu' and lower(u.email)=m.email
  and m.display_name='Pradyumn Agnoor' and m.status='active' and m.is_admin
  and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google';
alter table public.budget_owners enable row level security;
revoke all on public.budget_owners from public,anon,authenticated;
create function public.budget_role() returns text language sql stable security definer set search_path='' as $$
 select case when not public.active_member() then 'none'
 when exists(select 1 from public.budget_owners where member_id=auth.uid()) then 'owner'
 when exists(select 1 from public.members where id=auth.uid() and 'Logistics & Finance'=any(exec_roles)) then 'finance'
 when exists(select 1 from public.members where id=auth.uid() and 'Captain'=any(exec_roles)) then 'captain'
 when exists(select 1 from public.members where id=auth.uid() and cardinality(exec_roles)>0) then 'exec'
 else 'none' end
$$;
revoke all on function public.budget_role() from public,anon;
grant execute on function public.budget_role() to authenticated;

create table public.budget_funds (
 id text primary key check(id in ('venmo','goodbull','sofc')),name text not null,
 balance_cents integer not null default 0 check(abs(balance_cents::bigint)<=100000000),
 version integer not null default 1,updated_at timestamptz,updated_by uuid references public.members(id)
);
insert into public.budget_funds(id,name) values ('venmo','Venmo'),('goodbull','SOFC Good Bull'),('sofc','Main SOFC account');
create table public.budget_seasons (
 id uuid primary key, name text not null check(char_length(btrim(name)) between 1 and 80),
 limit_cents integer not null check(limit_cents between 0 and 100000000),original_cents integer not null,
 version integer not null default 1,created_at timestamptz not null default now()
);
create table public.budget_allocations (
 id uuid primary key default gen_random_uuid(),season_id uuid not null references public.budget_seasons(id),
 category text not null check(category in ('Production','Competition','Legends/Application','Travel','Hotel','Security Deposit','Misc.','Mix','Social')),
 limit_cents integer not null check(limit_cents between 0 and 100000000),original_cents integer not null,
 version integer not null default 1,unique(season_id,category)
);
create table public.budget_expenses (
 id uuid primary key,season_id uuid not null references public.budget_seasons(id),
 category text not null, fund_id text not null references public.budget_funds(id),
 title text not null check(char_length(btrim(title)) between 1 and 160),
 total_cents integer not null check(total_cents between 1 and 100000000),
 paid_cents integer not null default 0,reported_cents integer not null default 0,
 refunded_cents integer not null default 0,
 pending_refund_cents integer not null default 0,
 refund_included_in_balance boolean not null default false,
 included_in_balance boolean not null default false,
 status text not null default 'pending' check(status in ('pending','changes','approved')),
 notes text not null default '' check(char_length(notes)<=2000),due_on date,
 submitted_by uuid not null references public.members(id),submitted_name text not null,
 created_by uuid not null references public.members(id),created_at timestamptz not null default now(),
 reviewed_by uuid references public.members(id),reviewed_name text,reviewed_at timestamptz,review_note text,
 version integer not null default 1,
 deleted_at timestamptz,
 foreign key(season_id,category) references public.budget_allocations(season_id,category),
 check(paid_cents>=0 and reported_cents>=paid_cents and reported_cents<=total_cents),
 check(refunded_cents between 0 and paid_cents),
 check(pending_refund_cents between 0 and paid_cents-refunded_cents),
 check(fund_id<>'goodbull' or category in ('Hotel','Travel'))
);
create index budget_expenses_fund on public.budget_expenses(fund_id);
create table public.budget_events (
 id bigint generated always as identity primary key,expense_id uuid references public.budget_expenses(id) on delete cascade,
 fund_id text references public.budget_funds(id),season_id uuid references public.budget_seasons(id),
 actor_id uuid not null,actor_name text not null,action text not null,note text not null default '',
 delta_cents integer not null default 0,balance_after integer,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.budget_receipts (
 expense_id uuid primary key references public.budget_expenses(id) on delete cascade,
 filename text not null check(char_length(filename) between 1 and 160),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 content text not null check(length(content)<=2796204)
);
do $$declare t text;begin
 foreach t in array array['budget_funds','budget_seasons','budget_allocations','budget_expenses','budget_events','budget_receipts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy budget_read on public.%I for select to authenticated using (public.budget_role()<>''none'')',t);
 end loop;
end$$;
drop policy budget_read on public.budget_expenses;
create policy budget_read on public.budget_expenses for select to authenticated using (public.budget_role()<>'none' and deleted_at is null);
drop policy budget_read on public.budget_events;
create policy budget_read on public.budget_events for select to authenticated using(public.budget_role()<>'none' and (expense_id is null or exists(select 1 from public.budget_expenses e where e.id=expense_id and e.deleted_at is null)));
drop policy budget_read on public.budget_receipts;
create policy budget_read on public.budget_receipts for select to authenticated using(public.budget_role()<>'none' and exists(select 1 from public.budget_expenses e where e.id=expense_id and e.deleted_at is null));

-- All mutations take the same transaction lock: balance reconciliation, approval and
-- concurrent submissions cannot race. Expected revisions fence stale browser drafts.
create function public.budget_mutate(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 op text:=payload->>'operation'; role_name text; actor text; target uuid;
 e public.budget_expenses%rowtype; f public.budget_funds%rowtype; s public.budget_seasons%rowtype;
 v integer; amount integer; paid integer; delta integer; note text:=btrim(coalesce(payload->>'note',''));
 cat text; fund text; title text; included boolean; item jsonb; sum_limits bigint:=0; categories text[];
 receipt jsonb:=payload->'receipt'; prior jsonb;
begin
 perform pg_advisory_xact_lock(20261028,20);
 role_name:=public.budget_role();
 if role_name='none' then raise exception 'Budget access required';end if;
 select display_name into actor from public.members where id=auth.uid();
 if payload is null or jsonb_typeof(payload)<>'object' or op is null then raise exception 'Choose a valid operation';end if;
 if length(note)>2000 then raise exception 'Note is too long';end if;
 target:=(payload->>'id')::uuid;v:=(payload->>'version')::integer;
 if target is null or v is null or v<0 then raise exception 'ID and revision required';end if;

 if op='season' then
  if role_name not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
  title:=btrim(payload->>'name');amount:=(payload->>'limit_cents')::integer;
  if title is null or amount is null or amount<0 or amount>100000000 or char_length(title) not between 1 and 80 then raise exception 'Valid season name and limit required';end if;
  if jsonb_typeof(payload->'allocations') is distinct from 'array' or jsonb_array_length(payload->'allocations')<>9 then raise exception 'All nine category allocations required';end if;
  for item in select value from jsonb_array_elements(payload->'allocations') loop
   cat:=item->>'category';paid:=(item->>'limit_cents')::integer;
   if cat is null or cat<>all(array['Production','Competition','Legends/Application','Travel','Hotel','Security Deposit','Misc.','Mix','Social']) or cat=any(coalesce(categories,array[]::text[])) or paid is null or paid<0 or paid>100000000 then raise exception 'Invalid category allocation';end if;
   categories:=array_append(categories,cat);sum_limits:=sum_limits+paid;
  end loop;
  if sum_limits>amount then raise exception 'Category allocations exceed the season limit';end if;
  select * into s from public.budget_seasons where id=target;
  if found then
   if s.version<>v then raise exception 'Budget changed. Refresh';end if;
   if note='' then raise exception 'Explain the budget revision';end if;
   prior:=jsonb_build_object('season',to_jsonb(s),'allocations',(select jsonb_agg(a) from public.budget_allocations a where season_id=target));
   update public.budget_seasons set name=title,limit_cents=amount,version=version+1 where id=target;
  else
   if v<>0 then raise exception 'Budget changed. Refresh';end if;
   insert into public.budget_seasons(id,name,limit_cents,original_cents) values(target,title,amount,amount);
  end if;
  for item in select value from jsonb_array_elements(payload->'allocations') loop
   insert into public.budget_allocations(season_id,category,limit_cents,original_cents) values(target,item->>'category',(item->>'limit_cents')::integer,(item->>'limit_cents')::integer)
   on conflict(season_id,category) do update set limit_cents=excluded.limit_cents,version=budget_allocations.version+1;
  end loop;
  insert into public.budget_events(season_id,actor_id,actor_name,action,note,details) values(target,auth.uid(),actor,'budget_saved',note,jsonb_build_object('before',prior,'after',payload-'receipt'));
  return target;
 elsif op='balance' then
  if role_name not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
  fund:=payload->>'fund_id';amount:=(payload->>'amount_cents')::integer;
  select * into f from public.budget_funds where id=fund;
  if not found or f.version<>v then raise exception 'Fund changed. Refresh';end if;
  if amount is null or abs(amount::bigint)>100000000 or note='' then raise exception 'Valid balance and explanation required';end if;
  if exists(select 1 from public.budget_expenses where fund_id=fund and deleted_at is null and (reported_cents>paid_cents or pending_refund_cents>0)) then raise exception 'Review outstanding payment and refund reports before updating this balance';end if;
  delta:=amount-f.balance_cents;
  update public.budget_funds set balance_cents=amount,version=version+1,updated_at=now(),updated_by=auth.uid() where id=fund;
  insert into public.budget_events(fund_id,actor_id,actor_name,action,note,delta_cents,balance_after,details) values(fund,auth.uid(),actor,'balance_updated',note,delta,amount,jsonb_build_object('before',f.balance_cents,'request_id',target));
  return target;
 end if;

 select * into e from public.budget_expenses where id=target;
 if op='submit' then
  title:=btrim(payload->>'title');cat:=payload->>'category';fund:=payload->>'fund_id';
  amount:=(payload->>'total_cents')::integer;paid:=(payload->>'reported_cents')::integer;included:=(payload->>'included_in_balance')::boolean;
  if title is null or amount is null or paid is null or included is null or char_length(title) not between 1 and 160 or amount not between 1 and 100000000 or paid<0 or paid>amount then raise exception 'Valid expense name, total and payment amount required';end if;
  if fund='goodbull' and cat not in ('Hotel','Travel') then raise exception 'Good Bull is for Hotel and Travel only';end if;
  if e.id is not null then
   if e.version<>v or e.deleted_at is not null then raise exception 'Expense changed. Refresh';end if;
   if e.pending_refund_cents>0 then raise exception 'Finish the refund review before editing';end if;
   if (payload->>'season_id')::uuid is distinct from e.season_id then raise exception 'An expense keeps its original season';end if;
   if e.created_by<>auth.uid() and role_name<>'owner' then raise exception 'Only the submitter or owner can edit this expense';end if;
   if e.paid_cents>0 and (cat<>e.category or fund<>e.fund_id or (payload->>'season_id')::uuid<>e.season_id) then raise exception 'Paid expenses keep their original category, fund and season';end if;
   if paid<e.paid_cents or amount<e.paid_cents then raise exception 'Total and reported payment cannot be less than verified payments';end if;
   if amount<e.total_cents and e.status<>'changes' then raise exception 'Request a correction review before reducing a commitment';end if;
   prior:=to_jsonb(e);
   update public.budget_expenses set title=title,category=cat,fund_id=fund,total_cents=amount,reported_cents=paid,
    included_in_balance=included,status='pending',notes=coalesce(payload->>'notes',''),due_on=nullif(payload->>'due_on','')::date,
    submitted_by=auth.uid(),submitted_name=actor,reviewed_by=null,reviewed_name=null,reviewed_at=null,review_note=null,version=version+1
    where id=target;
  else
   if v<>0 then raise exception 'Expense changed. Refresh';end if;
   insert into public.budget_expenses(id,season_id,category,fund_id,title,total_cents,reported_cents,included_in_balance,notes,due_on,submitted_by,submitted_name,created_by)
    values(target,(payload->>'season_id')::uuid,cat,fund,title,amount,paid,included,coalesce(payload->>'notes',''),nullif(payload->>'due_on','')::date,auth.uid(),actor,auth.uid());
  end if;
  if receipt is not null and receipt<>'null'::jsonb then
   if jsonb_typeof(receipt)<>'object' then raise exception 'Invalid receipt';end if;
   insert into public.budget_receipts(expense_id,filename,mime,content) values(target,receipt->>'filename',receipt->>'mime',receipt->>'content')
    on conflict(expense_id) do update set filename=excluded.filename,mime=excluded.mime,content=excluded.content;
  end if;
  insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,details) values(target,fund,(payload->>'season_id')::uuid,auth.uid(),actor,'submitted',jsonb_build_object('before',prior,'after',payload-'receipt'));
  return target;
 end if;
 if e.id is null or e.version<>v or e.deleted_at is not null then raise exception 'Expense changed. Refresh';end if;
 if op in ('approve','changes') then
  if role_name not in ('captain','finance','owner') then raise exception 'Captain or Finance approval required';end if;
  if e.submitted_by=auth.uid() or e.created_by=auth.uid() then raise exception 'Someone else must review your expense';end if;
  if e.status<>'pending' then raise exception 'Expense is not awaiting approval';end if;
  if op='changes' then
   if note='' then raise exception 'Explain the requested changes';end if;
   update public.budget_expenses set status='changes',review_note=note,reviewed_by=auth.uid(),reviewed_name=actor,reviewed_at=now(),version=version+1 where id=target;
  else
   delta:=case when e.pending_refund_cents>0 then -case when e.refund_included_in_balance then 0 else e.pending_refund_cents end
    when e.included_in_balance then 0 else e.reported_cents-e.paid_cents end;
   update public.budget_funds set balance_cents=balance_cents-delta,version=version+1,updated_at=now(),updated_by=auth.uid() where id=e.fund_id returning * into f;
   update public.budget_expenses set status='approved',paid_cents=reported_cents,included_in_balance=false,
    refunded_cents=refunded_cents+pending_refund_cents,pending_refund_cents=0,refund_included_in_balance=false,
    reviewed_by=auth.uid(),reviewed_name=actor,reviewed_at=now(),review_note=note,version=version+1 where id=target;
  end if;
  insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,note,delta_cents,balance_after,details)
   values(target,e.fund_id,e.season_id,auth.uid(),actor,op,note,-coalesce(delta,0),f.balance_cents,jsonb_build_object('reviewed',to_jsonb(e)));
 elsif op='payment' then
  if e.status<>'approved' then raise exception 'Finish the current review before recording another payment';end if;
  amount:=(payload->>'amount_cents')::integer;included:=(payload->>'included_in_balance')::boolean;
  if amount is null or amount<=0 or amount>e.total_cents-e.paid_cents or included is null then raise exception 'Enter a payment no greater than the outstanding amount';end if;
  update public.budget_expenses set reported_cents=paid_cents+amount,included_in_balance=included,status='pending',submitted_by=auth.uid(),submitted_name=actor,reviewed_by=null,reviewed_name=null,reviewed_at=null,review_note=null,version=version+1 where id=target;
  insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,note,details) values(target,e.fund_id,e.season_id,auth.uid(),actor,'payment_reported',note,payload);
 elsif op='refund' then
  if e.status<>'approved' and not(e.status='changes' and e.pending_refund_cents>0) then raise exception 'Finish the current review before reporting a refund';end if;
  if e.status='changes' and e.submitted_by<>auth.uid() and role_name<>'owner' then raise exception 'Only the refund submitter or owner can correct it';end if;
  amount:=(payload->>'amount_cents')::integer;included:=(payload->>'included_in_balance')::boolean;
  if amount is null or amount<=0 or amount>e.paid_cents-e.refunded_cents or included is null then raise exception 'Enter a valid refund no greater than verified payments';end if;
  update public.budget_expenses set pending_refund_cents=amount,refund_included_in_balance=included,status='pending',submitted_by=auth.uid(),submitted_name=actor,reviewed_by=null,reviewed_name=null,reviewed_at=null,review_note=null,version=version+1 where id=target;
  insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,note,details) values(target,e.fund_id,e.season_id,auth.uid(),actor,'refund_reported',note,payload);
 elsif op='delete' then
 if role_name not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 if note='' then raise exception 'Explain the cancellation';end if;
 if e.reported_cents>0 or e.paid_cents>0 then
   -- Reverse only this expense's account changes since the last recorded
   -- actual balance. Earlier changes are already absorbed in that snapshot.
   select coalesce(-sum(ev.delta_cents),0)::integer into delta
    from public.budget_events ev
    where ev.expense_id=target and ev.action='approve'
     and ev.id>coalesce((select max(re.id) from public.budget_events re
       where re.fund_id=e.fund_id and re.action='balance_updated'),0);
   if delta<>0 then
    update public.budget_funds set balance_cents=balance_cents+delta,
     version=version+1,updated_at=now(),updated_by=auth.uid()
     where id=e.fund_id returning * into f;
   else
    select * into f from public.budget_funds where id=e.fund_id;
   end if;
   update public.budget_expenses set deleted_at=now(),version=version+1 where id=target;
   insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,note,delta_cents,balance_after,details)
    values(target,e.fund_id,e.season_id,auth.uid(),actor,'deleted',note,delta,f.balance_cents,
     jsonb_build_object('expense',to_jsonb(e),'balance_reversal_cents',delta));
  else
   delete from public.budget_expenses where id=target;
  end if;
 else raise exception 'Choose a valid operation';
 end if;
 return target;
end$$;
revoke all on function public.budget_mutate(jsonb) from public,anon;
grant execute on function public.budget_mutate(jsonb) to authenticated;
create function public.budget_import(items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer:=0;
begin
 if public.budget_role() not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Import 1 to 100 expenses at a time';end if;
 for item in select value from jsonb_array_elements(items) loop
  perform public.budget_mutate(item || '{"operation":"submit","version":0}'::jsonb);
  n:=n+1;
 end loop;
 return n;
end$$;
revoke all on function public.budget_import(jsonb) from public,anon;
grant execute on function public.budget_import(jsonb) to authenticated;
commit;
