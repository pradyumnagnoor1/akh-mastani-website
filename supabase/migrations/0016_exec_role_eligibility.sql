-- Assigning an exec role requires an existing manually granted admin permission.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0016',0));
create or replace function public.set_exec_roles(target_id uuid,roles text[],expected_roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.active_member() or not exists(select 1 from public.members where id=auth.uid() and is_admin) then raise exception 'Owner access required';end if;
 if roles is null or not roles <@ array['Captain','Logistics & Finance','Production','Social']::text[] or array_position(roles,null) is not null then raise exception 'Choose valid exec roles';end if;
 -- Lock eligibility along with the role write. Empty roles can revoke legacy assignments.
 perform 1 from public.members where id=target_id and status='active' and (is_admin or cardinality(roles)=0) for update;
 if not found then raise exception 'Only existing active admin members can receive exec roles';end if;
 update public.members set exec_roles=array(select distinct unnest(roles) order by 1) where id=target_id and status='active' and exec_roles=expected_roles;
 if not found then raise exception 'Member roles changed or member is inactive. Refresh';end if;
end;$$;
commit;
