-- Signed fund snapshots and known-expense removal.
begin;
create or replace function public.budget_save_setup(payload jsonb) returns uuid
 language plpgsql security definer set search_path='' as $$
declare item jsonb; fund public.budget_funds%rowtype; amount integer; requested_version integer;
 seen text[]:=array[]::text[]; budget_id uuid; actor text; reason text;
begin
 perform pg_advisory_xact_lock(20261028,20);
 if public.budget_role() not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 if payload->>'operation'<>'season' then raise exception 'Budget setup required';end if;
 if exists(select 1 from public.budget_seasons where id=(payload->>'id')::uuid and deleted_at is not null) then raise exception 'This budget was deleted';end if;
 if jsonb_typeof(payload->'fund_balances') is distinct from 'array' or jsonb_array_length(payload->'fund_balances')<>3 then raise exception 'Include all three funds';end if;
 select display_name into actor from public.members where id=auth.uid();
 reason:=btrim(coalesce(payload->>'note',''));
 if reason='' then reason:='Initial balance recorded during budget setup';end if;
 for item in select value from jsonb_array_elements(payload->'fund_balances') loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid fund balance';end if;
  select * into fund from public.budget_funds where id=item->>'fund_id';
  if fund.id is null or fund.id=any(seen) then raise exception 'Invalid or duplicate fund';end if;
  seen:=array_append(seen,fund.id);
  if item->>'amount_cents' is not null then
   amount:=(item->>'amount_cents')::integer;
   requested_version:=(item->>'version')::integer;
   if amount is null or amount not between -100000000 and 100000000 or requested_version is distinct from fund.version then raise exception 'Fund balance changed. Refresh';end if;
   if fund.updated_at is null or amount<>fund.balance_cents then
    if exists(select 1 from public.budget_expenses where fund_id=fund.id and deleted_at is null and (reported_cents>paid_cents or pending_refund_cents>0)) then raise exception 'Review outstanding payment and refund reports before updating this balance';end if;
    update public.budget_funds set balance_cents=amount,version=version+1,updated_at=now(),updated_by=auth.uid() where id=fund.id;
    insert into public.budget_events(fund_id,actor_id,actor_name,action,note,delta_cents,balance_after,details)
     values(fund.id,auth.uid(),actor,'balance_updated',reason,amount-fund.balance_cents,amount,jsonb_build_object('before',fund.balance_cents,'budget_setup_id',payload->>'id'));
   end if;
  end if;
 end loop;
 if not array['venmo','goodbull','sofc'] <@ seen then raise exception 'Include all three funds';end if;
 budget_id:=public.budget_mutate(payload-'fund_balances');
 return budget_id;
end$$;
revoke all on function public.budget_save_setup(jsonb) from public,anon;
grant execute on function public.budget_save_setup(jsonb) to authenticated;

create function public.budget_remove_planned(payload jsonb) returns uuid
 language plpgsql security definer set search_path='' as $$
declare target uuid; expected_version integer; plan public.budget_planned_expenses%rowtype; actor text;
begin
 perform pg_advisory_xact_lock(20261028,20);
 if public.budget_role() not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 target:=(payload->>'id')::uuid;expected_version:=(payload->>'version')::integer;
 select * into plan from public.budget_planned_expenses where id=target;
 if plan.id is null or plan.request_deduction then raise exception 'Cancel the linked expense to remove this known cost';end if;
 if not exists(select 1 from public.budget_seasons where id=plan.season_id and deleted_at is null and version=expected_version) then raise exception 'Budget changed. Refresh';end if;
 select display_name into actor from public.members where id=auth.uid();
 delete from public.budget_planned_expenses where id=target;
 update public.budget_seasons set version=version+1 where id=plan.season_id;
 insert into public.budget_events(season_id,actor_id,actor_name,action,details)
  values(plan.season_id,auth.uid(),actor,'planned_removed',jsonb_build_object('planned_expense',to_jsonb(plan)));
 return target;
end$$;
revoke all on function public.budget_remove_planned(jsonb) from public,anon;
grant execute on function public.budget_remove_planned(jsonb) to authenticated;
commit;
