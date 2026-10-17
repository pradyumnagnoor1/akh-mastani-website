-- Add the requested AO and Hospitality exec tags; preserve existing admin eligibility.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0017',0));
alter table public.members drop constraint members_exec_roles_check;
alter table public.members add constraint members_exec_roles_check
 check(exec_roles <@ array['Captain','Logistics & Finance','Production','Social','AO','Hospitality']::text[] and array_position(exec_roles,null) is null);
alter table public.communication_posts drop constraint communication_posts_author_exec_role_check;
alter table public.communication_posts add constraint communication_posts_author_exec_role_check
 check(author_exec_role in ('Captain','Logistics & Finance','Production','Social','AO','Hospitality'));
create or replace function public.set_exec_roles(target_id uuid,roles text[],expected_roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.active_member() or not exists(select 1 from public.members where id=auth.uid() and is_admin) then raise exception 'Owner access required';end if;
 if roles is null or not roles <@ array['Captain','Logistics & Finance','Production','Social','AO','Hospitality']::text[] or array_position(roles,null) is not null then raise exception 'Choose valid exec roles';end if;
 -- Lock eligibility along with the role write. Empty roles can revoke legacy assignments.
 perform 1 from public.members where id=target_id and status='active' and (is_admin or cardinality(roles)=0) for update;
 if not found then raise exception 'Only existing active admin members can receive exec roles';end if;
 update public.members set exec_roles=array(select distinct unnest(roles) order by 1) where id=target_id and status='active' and exec_roles=expected_roles;
 if not found then raise exception 'Member roles changed or member is inactive. Refresh';end if;
end;$$;
commit;
