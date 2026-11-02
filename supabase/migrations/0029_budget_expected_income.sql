-- Forecasts are separate from recorded balances; receipts are applied exactly once.
begin;
create table public.budget_income (
 id uuid primary key, season_id uuid not null references public.budget_seasons(id),
 name text not null check(char_length(name) between 1 and 100),
 category text not null check(char_length(category) between 1 and 50),
 expected_cents integer not null check(expected_cents between 1 and 100000000),
 received_cents integer not null default 0 check(received_cents>=0 and received_cents<=expected_cents),
 due_on date, canceled boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now()
);
create table public.budget_income_receipts (
 id uuid primary key, income_id uuid not null references public.budget_income(id),
 fund_id text not null references public.budget_funds(id), amount_cents integer not null check(amount_cents>0),
 included_in_balance boolean not null, actor_id uuid not null references public.members(id),
 actor_name text not null, created_at timestamptz not null default now()
);
alter table public.budget_income enable row level security;
alter table public.budget_income_receipts enable row level security;
revoke all on public.budget_income,public.budget_income_receipts from public,anon,authenticated;
grant select on public.budget_income,public.budget_income_receipts to authenticated;
create policy budget_income_read on public.budget_income for select to authenticated using (
 public.budget_role() in ('owner','finance','captain') and exists(select 1 from public.budget_seasons s where s.id=season_id and s.deleted_at is null));
create policy budget_income_receipt_read on public.budget_income_receipts for select to authenticated using (
 public.budget_role() in ('owner','finance','captain') and exists(select 1 from public.budget_income i where i.id=income_id));
create function public.budget_income_mutate(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 op text:=payload->>'operation'; target uuid:=(payload->>'id')::uuid; v integer:=(payload->>'version')::integer;
 item public.budget_income%rowtype; amount integer; title text; cat text; fund text; receipt_id uuid;
 actor text; bal integer; included boolean;
begin
 perform pg_advisory_xact_lock(20261028,20);
 if public.budget_role() not in ('owner','finance') then raise exception 'Finance or owner access required';end if;
 if target is null or v is null or v<0 then raise exception 'ID and revision required';end if;
 select display_name into actor from public.members where id=auth.uid();
 select * into item from public.budget_income where id=target;
 if op='income_save' then
  title:=btrim(payload->>'name');cat:=btrim(payload->>'category');amount:=(payload->>'expected_cents')::integer;
  if title is null or char_length(title) not between 1 and 100 or cat is null or char_length(cat) not between 1 and 50 or amount is null or amount not between 1 and 100000000 then raise exception 'Enter a name, category and valid expected amount';end if;
  if not exists(select 1 from public.budget_seasons where id=(payload->>'season_id')::uuid and deleted_at is null) then raise exception 'Choose an active budget';end if;
  if item.id is null then
   if v<>0 then raise exception 'Income changed. Refresh';end if;
   insert into public.budget_income(id,season_id,name,category,expected_cents,due_on) values(target,(payload->>'season_id')::uuid,title,cat,amount,nullif(payload->>'due_on','')::date);
  else
   if item.version<>v or item.canceled then raise exception 'Income changed. Refresh';end if;
   if item.season_id is distinct from (payload->>'season_id')::uuid then raise exception 'Income keeps its original budget';end if;
   if amount<item.received_cents then raise exception 'Expected amount cannot be less than income already received';end if;
   update public.budget_income set name=title,category=cat,expected_cents=amount,due_on=nullif(payload->>'due_on','')::date,version=version+1 where id=target;
  end if;
 elsif op in ('income_receive','income_cancel') then
  if item.id is null or item.version<>v or item.canceled then raise exception 'Income changed. Refresh';end if;
  if not exists(select 1 from public.budget_seasons where id=item.season_id and deleted_at is null) then raise exception 'This budget was deleted';end if;
  if op='income_cancel' then
   if item.received_cents>=item.expected_cents then raise exception 'This income is already received';end if;
   update public.budget_income set canceled=true,version=version+1 where id=target;
  else
   amount:=(payload->>'amount_cents')::integer;fund:=payload->>'fund_id';receipt_id:=(payload->>'receipt_id')::uuid;included:=(payload->>'included_in_balance')::boolean;
   if amount is null or amount<=0 or amount>item.expected_cents-item.received_cents or receipt_id is null or included is null then raise exception 'Enter an amount no greater than the outstanding income';end if;
   if exists(select 1 from public.budget_income_receipts where id=receipt_id) then raise exception 'Receipt already recorded. Refresh';end if;
   if not exists(select 1 from public.budget_funds where id=fund and updated_at is not null) then raise exception 'Choose an account with a recorded balance';end if;
   insert into public.budget_income_receipts(id,income_id,fund_id,amount_cents,included_in_balance,actor_id,actor_name) values(receipt_id,target,fund,amount,included,auth.uid(),actor);
   update public.budget_income set received_cents=received_cents+amount,version=version+1 where id=target;
   if not included then
    update public.budget_funds set balance_cents=balance_cents+amount,version=version+1,updated_at=now(),updated_by=auth.uid() where id=fund returning balance_cents into bal;
   else select balance_cents into bal from public.budget_funds where id=fund;
   end if;
   insert into public.budget_events(fund_id,season_id,actor_id,actor_name,action,note,delta_cents,balance_after,details)
    values(fund,item.season_id,auth.uid(),actor,'income_received',item.name,case when included then 0 else amount end,bal,jsonb_build_object('income_id',target,'receipt_id',receipt_id,'amount_cents',amount,'included_in_balance',included));
  end if;
 else raise exception 'Choose a valid income action';end if;
 if op<>'income_receive' then
  insert into public.budget_events(season_id,actor_id,actor_name,action,note,details) values(coalesce(item.season_id,(payload->>'season_id')::uuid),auth.uid(),actor,op,coalesce(title,item.name),jsonb_build_object('income_id',target,'before',to_jsonb(item),'request',payload));
 end if;
 return target;
end$$;
revoke all on function public.budget_income_mutate(jsonb) from public,anon;
grant execute on function public.budget_income_mutate(jsonb) to authenticated;
commit;
