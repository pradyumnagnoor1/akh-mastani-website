-- General execs request permission before spending; preserve historical records.
begin;
alter table public.budget_expenses add column is_request boolean not null default false;
alter table public.budget_expenses add column request_approved_at timestamptz;
create or replace function public.budget_mutate(payload jsonb) returns uuid
 language plpgsql security definer set search_path='' as $$
declare role_name text; season_id uuid; own_expense public.budget_expenses%rowtype; op text:=payload->>'operation'; result uuid;
begin
 role_name:=public.budget_role();
 if role_name='none' then raise exception 'Budget access required';end if;
 if op in ('season','submit') and exists(
  select 1 from public.budget_seasons where id=(case when op='season' then payload->>'id' else payload->>'season_id' end)::uuid and deleted_at is not null
 ) then raise exception 'This budget was deleted';end if;
 if role_name='exec' then
  if op='submit' and ((payload->>'reported_cents')::integer is distinct from 0 or (payload->>'included_in_balance')::boolean is distinct from false) then raise exception 'Request approval before spending. Payment reports must be recorded by FML or Captains';end if;
  if op<>'submit' then raise exception 'Exec members may only submit expenses';end if;
  if payload->>'version'='0' then
   season_id:=public.budget_submission_season();
   if season_id is null then raise exception 'Finance must set up the budget before expenses can be added';end if;
   if (payload->>'season_id')::uuid is distinct from season_id then raise exception 'Submit to the current budget season';end if;
  else
   select * into own_expense from public.budget_expenses where id=(payload->>'id')::uuid;
   if own_expense.id is null or own_expense.created_by is distinct from auth.uid()
      or own_expense.deleted_at is not null or own_expense.status not in ('pending','changes')
      or own_expense.paid_cents>0 or own_expense.reported_cents>0 or own_expense.pending_refund_cents>0
      or own_expense.version is distinct from (payload->>'version')::integer then
    raise exception 'Only your pending expenses can be edited. Refresh and try again';
   end if;
  end if;
 end if;
 result:=public.budget_mutate_impl(payload);
 if op='submit' then
  update public.budget_expenses set is_request=(is_request or role_name='exec'),request_approved_at=null where id=result;
 elsif op='approve' then
  update public.budget_expenses set request_approved_at=coalesce(request_approved_at,now()) where id=result and is_request;
 end if;
 return result;
end$$;

commit;
