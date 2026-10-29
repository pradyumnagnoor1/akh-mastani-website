-- Balance snapshots in setup, reversible season hiding, and safe budget access.
begin;
alter table public.budget_seasons add column deleted_at timestamptz;

create or replace function public.budget_submission_season() returns uuid
 language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if public.budget_role()='none' then raise exception 'Exec access required';end if;
 select id into result from public.budget_seasons where deleted_at is null order by created_at desc,id desc limit 1;
 return result;
end$$;

create or replace function public.budget_mutate(payload jsonb) returns uuid
 language plpgsql security definer set search_path='' as $$
declare role_name text; season_id uuid; own_expense public.budget_expenses%rowtype; op text:=payload->>'operation';
begin
 role_name:=public.budget_role();
 if role_name='none' then raise exception 'Budget access required';end if;
 if op in ('season','submit') and exists(
  select 1 from public.budget_seasons where id=(case when op='season' then payload->>'id' else payload->>'season_id' end)::uuid and deleted_at is not null
 ) then raise exception 'This budget was deleted';end if;
 if role_name='exec' then
  if op<>'submit' then raise exception 'Exec members may only submit expenses';end if;
  if payload->>'version'='0' then
   season_id:=public.budget_submission_season();
   if season_id is null then raise exception 'Finance must set up the budget before expenses can be added';end if;
   if (payload->>'season_id')::uuid is distinct from season_id then raise exception 'Submit to the current budget season';end if;
  else
   select * into own_expense from public.budget_expenses where id=(payload->>'id')::uuid;
   if own_expense.id is null or own_expense.created_by is distinct from auth.uid()
      or own_expense.deleted_at is not null or own_expense.status not in ('pending','changes')
      or own_expense.version is distinct from (payload->>'version')::integer then
    raise exception 'Only your pending expenses can be edited. Refresh and try again';
   end if;
  end if;
 end if;
 return public.budget_mutate_impl(payload);
end$$;

create function public.budget_save_setup(payload jsonb) returns uuid
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
   if amount is null or amount not between 0 and 100000000 or requested_version is distinct from fund.version then raise exception 'Fund balance changed. Refresh';end if;
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

create function public.budget_delete_season(payload jsonb) returns uuid
 language plpgsql security definer set search_path='' as $$
declare target uuid; expected_version integer; reason text; actor text; old_season public.budget_seasons%rowtype;
begin
 perform pg_advisory_xact_lock(20261028,20);
 if public.budget_role() not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 target:=(payload->>'id')::uuid;expected_version:=(payload->>'version')::integer;
 reason:=btrim(coalesce(payload->>'note',''));
 if target is null or expected_version is null or reason='' or length(reason)>2000 then raise exception 'Budget, revision and deletion reason required';end if;
 select * into old_season from public.budget_seasons where id=target and deleted_at is null;
 if old_season.id is null or old_season.version<>expected_version then raise exception 'Budget changed. Refresh';end if;
 if exists(select 1 from public.budget_expenses where season_id=target and deleted_at is null) then raise exception 'Cancel this budget’s active expenses before deleting it';end if;
 select display_name into actor from public.members where id=auth.uid();
 update public.budget_seasons set deleted_at=now(),version=version+1 where id=target;
 insert into public.budget_events(season_id,actor_id,actor_name,action,note,details)
  values(target,auth.uid(),actor,'budget_deleted',reason,jsonb_build_object('season',to_jsonb(old_season)));
 return target;
end$$;
revoke all on function public.budget_delete_season(jsonb) from public,anon;
grant execute on function public.budget_delete_season(jsonb) to authenticated;
commit;
