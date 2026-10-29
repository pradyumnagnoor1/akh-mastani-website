-- Keep financial records private to Finance, Captains and the Budget owner.
-- Other active execs retain only a new-expense submission capability.
begin;

do $$declare t text;begin
 foreach t in array array['budget_funds','budget_seasons','budget_allocations','budget_expenses','budget_events','budget_receipts'] loop
  execute format('drop policy budget_read on public.%I',t);
  execute format('create policy budget_read on public.%I for select to authenticated using (public.budget_role() in (''finance'',''captain'',''owner'')%s)',t,
   case t when 'budget_expenses' then ' and deleted_at is null'
    when 'budget_events' then ' and (expense_id is null or exists(select 1 from public.budget_expenses e where e.id=expense_id and e.deleted_at is null))'
    when 'budget_receipts' then ' and exists(select 1 from public.budget_expenses e where e.id=expense_id and e.deleted_at is null)'
    else '' end);
 end loop;
end$$;

-- Return only the current season identifier; neither limits nor balances leak.
create function public.budget_submission_season() returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if public.budget_role()='none' then raise exception 'Exec access required';end if;
 select id into result from public.budget_seasons order by created_at desc,id desc limit 1;
 return result;
end$$;
revoke all on function public.budget_submission_season() from public,anon;
grant execute on function public.budget_submission_season() to authenticated;

-- Preserve the reviewed transaction implementation, but remove its direct
-- entry point before exposing a narrower public wrapper.
alter function public.budget_mutate(jsonb) rename to budget_mutate_impl;
revoke all on function public.budget_mutate_impl(jsonb) from public,anon,authenticated;
create function public.budget_mutate(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare role_name text; season_id uuid;
begin
 role_name:=public.budget_role();
 if role_name='none' then raise exception 'Budget access required';end if;
 if role_name='exec' then
  if payload->>'operation'<>'submit' or payload->>'version'<>'0' then
   raise exception 'Exec members may only add new expenses';
  end if;
  season_id:=public.budget_submission_season();
  if season_id is null then raise exception 'Finance must set up the budget before expenses can be added';end if;
  if (payload->>'season_id')::uuid is distinct from season_id then raise exception 'Submit to the current budget season';end if;
 end if;
 return public.budget_mutate_impl(payload);
end$$;
revoke all on function public.budget_mutate(jsonb) from public,anon;
grant execute on function public.budget_mutate(jsonb) to authenticated;
commit;
