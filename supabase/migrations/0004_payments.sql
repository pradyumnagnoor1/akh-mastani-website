-- Immutable charges, snapshot recipients, and append-only audit. No money transfer.
create table public.payment_batches(id uuid primary key,created_at timestamptz not null default now());
create table public.payment_charges (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.payment_batches(id),
 member_id uuid not null references public.members(id),amount_cents integer not null check(amount_cents between 1 and 1000000),
 reason text not null check(char_length(btrim(reason)) between 1 and 160),instructions text not null check(char_length(btrim(instructions)) between 1 and 3000),due_on date,
 status text not null default 'unpaid' check(status in ('unpaid','reported','verified','waived')),version integer not null default 1 check(version>0),
 reported_at timestamptz,report_note text,review_note text,verified_at timestamptz,
 created_at timestamptz not null default now(),created_by uuid references public.members(id),unique(batch_id,member_id)
);
create index payment_charges_member on public.payment_charges(member_id,status);
create table public.payment_audit(id bigint generated always as identity primary key,charge_id uuid not null references public.payment_charges(id),actor_id uuid not null,action text not null,note text,details jsonb not null,created_at timestamptz not null default now());
alter table public.payment_batches enable row level security;
alter table public.payment_charges enable row level security;
alter table public.payment_audit enable row level security;
revoke all on public.payment_batches,public.payment_charges,public.payment_audit from public,anon,authenticated;
grant select on public.payment_charges,public.payment_audit to authenticated;
create policy payment_read on public.payment_charges for select to authenticated using(public.admin_member() or (public.active_member() and member_id=auth.uid()));
create policy payment_audit_read on public.payment_audit for select to authenticated using(public.admin_member() or (public.active_member() and exists(select 1 from public.payment_charges c where c.id=charge_id and c.member_id=auth.uid())));
create function public.issue_payment_charges(batch_id uuid,amount integer,charge_reason text,payment_instructions text,due_date date,audience text,recipient_ids uuid[],source_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[];c public.payment_charges%rowtype;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if batch_id is null or amount is null or amount not between 1 and 1000000 or charge_reason is null or char_length(btrim(charge_reason)) not between 1 and 160 or charge_reason ~ '[[:cntrl:]]' or payment_instructions is null or char_length(btrim(payment_instructions)) not between 1 and 3000 then raise exception 'Invalid charge amount, reason or instructions';end if;
 if audience is null or audience not in ('individual','selected','group','segment','team') or (audience in ('group','segment') and source_id is null) or (audience not in ('group','segment') and source_id is not null) then raise exception 'Invalid audience source';end if;
 ids:=array(select distinct unnest(recipient_ids) order by 1);
 if audience not in ('individual','selected') and cardinality(ids)>0 then raise exception 'Invalid recipients';end if;
 if audience='team' then ids:=array(select id from public.members where status='active' and display_name is not null order by id);
 elsif audience='group' then
  perform 1 from public.communication_groups where id=source_id and archived_at is null for share;
  if not found then raise exception 'Active group required';end if;
  ids:=array(select member_id from public.communication_group_members where group_id=source_id order by member_id);
 elsif audience='segment' then
  perform 1 from public.segments where id=source_id and archived_at is null for share;
  if not found then raise exception 'Active segment required';end if;
  ids:=array(select member_id from public.segment_members where segment_id=source_id order by member_id);
 end if;
 perform 1 from public.members where id=any(ids) order by id for share;
 if audience in ('team','group','segment') then ids:=array(select id from public.members where id=any(ids) and status='active' and display_name is not null order by id);end if;
 if cardinality(ids)=0 or (audience='individual' and cardinality(ids)<>1) or exists(select 1 from unnest(ids) i where i is null or not exists(select 1 from public.members where id=i and status='active' and display_name is not null)) then raise exception 'Choose active recipients';end if;
 insert into public.payment_batches(id) values(batch_id);
 for c in insert into public.payment_charges(batch_id,member_id,amount_cents,reason,instructions,due_on,created_by) select batch_id,unnest(ids),amount,btrim(charge_reason),btrim(payment_instructions),due_date,auth.uid() returning * loop
  insert into public.payment_audit(charge_id,actor_id,action,details) values(c.id,auth.uid(),'issued',jsonb_build_object('amount_cents',amount,'reason',c.reason,'instructions',c.instructions,'due_on',due_date,'audience',audience,'source_id',source_id,'version',1));
 end loop;
end;$$;
create function public.transition_payment(target_id uuid,expected_version integer,operation text,note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.payment_charges%rowtype;next_status text;clean_note text:=nullif(btrim(note),'');
begin
 if not public.active_member() then raise exception 'Active member required';end if;
 if operation is null or operation not in ('report','verify','reject','waive') then raise exception 'Invalid operation';end if;
 if operation<>'report' and not public.admin_member() then raise exception 'Admin access required';end if;
 select * into c from public.payment_charges where id=target_id for update;
 if c.id is null or (operation='report' and c.member_id<>auth.uid()) then raise exception 'Own charge required';end if;
 if expected_version is null or c.version<>expected_version then raise exception 'Payment changed. Refresh';end if;
 if char_length(clean_note)>1000 or (operation in ('reject','waive') and clean_note is null) then raise exception 'Explanation required, maximum 1000 characters';end if;
 if (operation='report' and c.status<>'unpaid') or (operation in ('verify','reject') and c.status<>'reported') or (operation='waive' and c.status not in ('unpaid','reported')) then raise exception 'Payment changed. Refresh';end if;
 next_status:=case operation when 'report' then 'reported' when 'verify' then 'verified' when 'reject' then 'unpaid' else 'waived' end;
 update public.payment_charges set status=next_status,version=version+1,
 reported_at=case when operation='report' then now() else reported_at end,
 report_note=case when operation='report' then clean_note else report_note end,
 review_note=case when operation<>'report' then clean_note else null end,
 verified_at=case when operation='verify' then now() else verified_at end where id=target_id;
 insert into public.payment_audit(charge_id,actor_id,action,note,details) values(target_id,auth.uid(),operation,clean_note,jsonb_build_object('from',c.status,'to',next_status,'version',c.version+1));
end;$$;
revoke all on function public.issue_payment_charges(uuid,integer,text,text,date,text,uuid[],uuid),public.transition_payment(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.issue_payment_charges(uuid,integer,text,text,date,text,uuid[],uuid),public.transition_payment(uuid,integer,text,text) to authenticated;
