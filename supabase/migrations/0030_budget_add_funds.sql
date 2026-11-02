-- An additive credit is not a reconciliation snapshot.
begin;
create function public.budget_add_funds(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=(payload->>'id')::uuid; v integer:=(payload->>'version')::integer;
 amount integer:=(payload->>'amount_cents')::integer; fund text:=payload->>'fund_id';
 note text:=btrim(payload->>'note'); actor text; f public.budget_funds%rowtype;
begin
 perform pg_advisory_xact_lock(20261028,20);
 if public.budget_role() not in ('finance','owner') then raise exception 'Finance or owner access required';end if;
 if target is null or v is null or amount is null or amount not between 1 and 100000000 or note is null or char_length(note) not between 1 and 2000 then raise exception 'Enter a positive amount and a reason';end if;
 if exists(select 1 from public.budget_events where action='funds_added' and details->>'request_id'=target::text) then raise exception 'This addition was already recorded. Refresh';end if;
 select * into f from public.budget_funds where id=fund;
 if f.id is null or f.updated_at is null then raise exception 'Record the current account balance first';end if;
 if f.version<>v then raise exception 'Fund changed. Refresh before adding money';end if;
 if abs(f.balance_cents::bigint+amount)>100000000 then raise exception 'Resulting balance is too large';end if;
 select display_name into actor from public.members where id=auth.uid();
 update public.budget_funds set balance_cents=balance_cents+amount,version=version+1,updated_at=now(),updated_by=auth.uid() where id=fund returning * into f;
 insert into public.budget_events(fund_id,actor_id,actor_name,action,note,delta_cents,balance_after,details)
 values(fund,auth.uid(),actor,'funds_added',note,amount,f.balance_cents,jsonb_build_object('request_id',target,'before',f.balance_cents-amount));
 return target;
end$$;
revoke all on function public.budget_add_funds(jsonb) from public,anon;
grant execute on function public.budget_add_funds(jsonb) to authenticated;
commit;
