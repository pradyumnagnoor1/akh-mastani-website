-- Add custom category allocations while deriving the budget total from their sum.
-- Category names alone are available to active execs for expense submission.
begin;
alter table public.budget_allocations drop constraint budget_allocations_category_check;
alter table public.budget_allocations add constraint budget_allocations_category_valid
 check(char_length(category) between 2 and 50 and category=btrim(category)
  and category ~ '^[[:alnum:]][-[:alnum:] &/''().,–]*$');

create table public.budget_planned_expenses (
 id uuid primary key,season_id uuid not null references public.budget_seasons(id),
 category text not null,name text not null check(char_length(name) between 2 and 80 and name=btrim(name) and name ~ '^[[:alnum:]][-[:alnum:] &/''().,–]*$'),
 amount_cents integer not null check(amount_cents between 1 and 100000000),
 request_deduction boolean not null default false,
 fund_id text references public.budget_funds(id),included_in_balance boolean not null default false,
 check((request_deduction and fund_id is not null) or (not request_deduction and fund_id is null and not included_in_balance)),
 foreign key(season_id,category) references public.budget_allocations(season_id,category)
);
alter table public.budget_planned_expenses enable row level security;
revoke all on public.budget_planned_expenses from public,anon,authenticated;
grant select on public.budget_planned_expenses to authenticated;
create policy budget_planned_read on public.budget_planned_expenses for select to authenticated
 using(public.budget_role() in ('finance','captain','owner'));

create or replace function public.budget_mutate_impl(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 op text:=payload->>'operation'; role_name text; actor text; target uuid;
 e public.budget_expenses%rowtype; f public.budget_funds%rowtype; s public.budget_seasons%rowtype;
 v integer; amount integer; paid integer; delta integer; note text:=btrim(coalesce(payload->>'note',''));
 cat text; fund text; title text; included boolean; item jsonb; sum_limits bigint:=0; categories text[]; category_names text[];
 receipt jsonb:=payload->'receipt'; prior jsonb;
 planned_input jsonb:=coalesce(payload->'planned_expenses','[]'::jsonb); planned_totals jsonb:='{}'::jsonb; planned_ids uuid[]; plan_keys text[];
 planned_id uuid; planned_cat text; planned_name text; planned_amount integer; plan_request boolean; plan_fund text; plan_included boolean; old_requested_ids uuid[];
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
  if title is null or amount is null or amount<1 or amount>100000000 or char_length(title) not between 2 and 80 or title !~ '^[[:alnum:]][-[:alnum:] &/''().,–]*$' then raise exception 'Valid budget name and total required';end if;
  if jsonb_typeof(payload->'allocations') is distinct from 'array' or jsonb_array_length(payload->'allocations') not between 9 and 40 then raise exception 'Nine standard categories and at most 31 custom categories required';end if;
  for item in select value from jsonb_array_elements(payload->'allocations') loop
   cat:=item->>'category';paid:=(item->>'limit_cents')::integer;
   if cat is null or char_length(cat) not between 2 and 50 or cat<>btrim(cat) or cat !~ '^[[:alnum:]][-[:alnum:] &/''().,–]*$' or lower(cat)=any(coalesce(categories,array[]::text[])) or paid is null or paid<0 or paid>100000000 then raise exception 'Invalid category allocation';end if;
   categories:=array_append(categories,lower(cat));category_names:=array_append(category_names,cat);sum_limits:=sum_limits+paid;
  end loop;
  if not array['Production','Competition','Legends/Application','Travel','Hotel','Security Deposit','Misc.','Mix','Social'] <@ category_names then raise exception 'All nine standard categories required';end if;
  if sum_limits<>amount then raise exception 'Budget total must equal category allocations';end if;
  if jsonb_typeof(planned_input) is distinct from 'array' or jsonb_array_length(planned_input)>100 then raise exception 'Choose at most 100 planned expenses';end if;
  for item in select value from jsonb_array_elements(planned_input) loop
   planned_id:=(item->>'id')::uuid;planned_cat:=item->>'category';planned_name:=btrim(item->>'name');planned_amount:=(item->>'amount_cents')::integer;
   plan_request:=coalesce((item->>'request_deduction')::boolean,false);plan_fund:=nullif(item->>'fund_id','');plan_included:=coalesce((item->>'included_in_balance')::boolean,false);
   if planned_id is null or planned_id=any(coalesce(planned_ids,array[]::uuid[]))
    or planned_cat is null or lower(planned_cat)<>all(categories)
    or planned_name is null or char_length(planned_name) not between 2 and 80 or planned_name !~ '^[[:alnum:]][-[:alnum:] &/''().,–]*$'
    or planned_amount is null or planned_amount not between 1 and 100000000
    or lower(planned_cat||':'||planned_name)=any(coalesce(plan_keys,array[]::text[]))
    or (plan_request and (plan_fund is null or plan_fund not in ('venmo','goodbull','sofc') or (plan_fund='goodbull' and planned_cat not in ('Hotel','Travel'))))
    or (not plan_request and (plan_fund is not null or plan_included))
   then raise exception 'Invalid planned expense';end if;
   planned_ids:=array_append(planned_ids,planned_id);
   plan_keys:=array_append(plan_keys,lower(planned_cat||':'||planned_name));
   planned_totals:=jsonb_set(planned_totals,array[planned_cat],to_jsonb(coalesce((planned_totals->>planned_cat)::bigint,0)+planned_amount));
  end loop;
  for item in select value from jsonb_array_elements(payload->'allocations') loop
   if coalesce((planned_totals->>(item->>'category'))::bigint,0)>(item->>'limit_cents')::bigint then raise exception 'Planned expenses exceed their category allocation';end if;
  end loop;
  select * into s from public.budget_seasons where id=target;
  if found then
   if s.version<>v then raise exception 'Budget changed. Refresh';end if;
   if exists(select 1 from public.budget_allocations a where a.season_id=target and a.category<>all(category_names)) then raise exception 'Existing categories must remain in the budget';end if;
   if exists(select 1 from public.budget_planned_expenses p where p.season_id=target and p.request_deduction
    and not exists(select 1 from jsonb_array_elements(planned_input) x where x->>'id'=p.id::text
      and x->>'name'=p.name and x->>'category'=p.category and (x->>'amount_cents')::integer=p.amount_cents
      and (x->>'request_deduction')::boolean=true and x->>'fund_id'=p.fund_id
      and (x->>'included_in_balance')::boolean=p.included_in_balance))
    then raise exception 'An existing fund deduction request must remain unchanged';end if;
   if note='' then raise exception 'Explain the budget revision';end if;
   prior:=jsonb_build_object('season',to_jsonb(s),'allocations',(select jsonb_agg(a) from public.budget_allocations a where season_id=target),'planned_expenses',(select jsonb_agg(p) from public.budget_planned_expenses p where season_id=target));
   update public.budget_seasons set name=title,limit_cents=amount,version=version+1 where id=target;
  else
   if v<>0 then raise exception 'Budget changed. Refresh';end if;
   insert into public.budget_seasons(id,name,limit_cents,original_cents) values(target,title,amount,amount);
  end if;
  for item in select value from jsonb_array_elements(payload->'allocations') loop
   insert into public.budget_allocations(season_id,category,limit_cents,original_cents) values(target,item->>'category',(item->>'limit_cents')::integer,(item->>'limit_cents')::integer)
   on conflict(season_id,category) do update set limit_cents=excluded.limit_cents,version=budget_allocations.version+1;
  end loop;
  select coalesce(array_agg(id),'{}'::uuid[]) into old_requested_ids from public.budget_planned_expenses where season_id=target and request_deduction;
  delete from public.budget_planned_expenses where season_id=target;
  for item in select value from jsonb_array_elements(planned_input) loop
   planned_id:=(item->>'id')::uuid;
   insert into public.budget_planned_expenses(id,season_id,category,name,amount_cents,request_deduction,fund_id,included_in_balance)
    values(planned_id,target,item->>'category',btrim(item->>'name'),(item->>'amount_cents')::integer,coalesce((item->>'request_deduction')::boolean,false),nullif(item->>'fund_id',''),coalesce((item->>'included_in_balance')::boolean,false));
   if coalesce((item->>'request_deduction')::boolean,false) and planned_id<>all(old_requested_ids) then
    insert into public.budget_expenses(id,season_id,category,fund_id,title,total_cents,reported_cents,included_in_balance,notes,submitted_by,submitted_name,created_by)
     values(planned_id,target,item->>'category',item->>'fund_id',btrim(item->>'name'),(item->>'amount_cents')::integer,(item->>'amount_cents')::integer,coalesce((item->>'included_in_balance')::boolean,false),'Created from budget setup',auth.uid(),actor,auth.uid());
    insert into public.budget_events(expense_id,fund_id,season_id,actor_id,actor_name,action,details)
     values(planned_id,item->>'fund_id',target,auth.uid(),actor,'submitted',jsonb_build_object('source','budget_setup','planned_expense_id',planned_id));
   end if;
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
   if amount<e.total_cents and e.status='approved' then raise exception 'Request a correction review before reducing a commitment';end if;
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
 delete from public.budget_planned_expenses where id=target;
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

create function public.budget_submission_categories() returns text[]
 language plpgsql stable security definer set search_path='' as $$
declare result text[];
begin
 if public.budget_role()='none' then raise exception 'Exec access required';end if;
 select coalesce(array_agg(a.category order by a.category),'{}'::text[]) into result
 from public.budget_allocations a where a.season_id=public.budget_submission_season();
 return result;
end$$;
revoke all on function public.budget_submission_categories() from public,anon;
grant execute on function public.budget_submission_categories() to authenticated;
commit;
