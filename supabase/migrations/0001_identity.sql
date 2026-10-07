-- Identity foundation. Run through Supabase migrations as the database owner.
create table public.members (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique check (email ~ '^[^@[:space:]]+@tamu[.]edu$'),
 display_name text check (display_name is null or (char_length(display_name) between 1 and 80 and display_name !~ '[[:cntrl:]]' and btrim(display_name) <> '')),
 status text not null default 'pending' check (status in ('pending','active','inactive')),
 is_admin boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.member_audit (
 id bigint generated always as identity primary key,
 actor_id uuid,
 member_id uuid,
 action text not null,
 created_at timestamptz not null default now()
);
alter table public.members enable row level security;
alter table public.member_audit enable row level security;
revoke all on public.members,public.member_audit from public,anon,authenticated;
grant select on public.members,public.member_audit to authenticated;

-- User-controlled metadata is deliberately not used for authorization.
create function public.eligible_identity() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid()
 and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$'
 and u.email_confirmed_at is not null
 and u.raw_app_meta_data->>'provider'='google');
$$;
create function public.active_member() returns boolean
language sql stable security definer set search_path = '' as $$
 select public.eligible_identity() and exists(select 1 from public.members m join auth.users u on u.id=m.id
 where m.id=auth.uid() and m.status='active' and m.display_name is not null and m.email=lower(u.email));
$$;
create function public.admin_member() returns boolean
language sql stable security definer set search_path = '' as $$
 select public.active_member() and exists(select 1 from public.members where id=auth.uid() and is_admin);
$$;
-- Use a definer helper for own-profile email comparison: auth.users is not exposed.
create function public.own_member(member_id uuid,member_email text) returns boolean
language sql stable security definer set search_path = '' as $$
 select member_id=auth.uid() and exists(select 1 from auth.users where id=auth.uid() and lower(email)=member_email);
$$;
create policy members_read on public.members for select to authenticated using (
 public.eligible_identity() and (public.own_member(id,email) or (public.active_member() and status='active') or public.admin_member())
);
create policy audit_read on public.member_audit for select to authenticated using (public.admin_member());

create function public.ensure_member() returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.eligible_identity() then raise exception 'Verified TAMU Google account required'; end if;
 insert into public.members(id,email) select id,lower(email) from auth.users where id=auth.uid()
 on conflict (id) do nothing;
end;
$$;
create function public.complete_onboarding(member_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean_name text;
begin
 if not public.eligible_identity() then raise exception 'Verified TAMU Google account required'; end if;
 if member_name is null or member_name ~ '[[:cntrl:]]' then raise exception 'Enter a valid name'; end if;
 clean_name := btrim(regexp_replace(member_name,'[[:space:]]+',' ','g'));
 if char_length(clean_name) not between 1 and 80 then raise exception 'Name must be 1–80 characters'; end if;
 perform public.ensure_member();
 update public.members set display_name=clean_name where id=auth.uid() and display_name is null and status <> 'inactive' and public.own_member(id,email);
end;
$$;
create function public.set_member_status(target_id uuid,new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required'; end if;
 if new_status not in ('active','inactive') or new_status is null then raise exception 'Invalid status'; end if;
 if target_id=auth.uid() then raise exception 'Cannot change your own membership status'; end if;
 update public.members set status=new_status where id=target_id and display_name is not null;
 if not found then raise exception 'Member must complete onboarding first'; end if;
end;
$$;
create function public.correct_member_name(target_id uuid,member_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean_name text;
begin
 if not public.admin_member() then raise exception 'Admin access required'; end if;
 if member_name is null or member_name ~ '[[:cntrl:]]' then raise exception 'Enter a valid name'; end if;
 clean_name := btrim(regexp_replace(member_name,'[[:space:]]+',' ','g'));
 if char_length(clean_name) not between 1 and 80 then raise exception 'Name must be 1–80 characters'; end if;
 update public.members set display_name=clean_name where id=target_id and display_name is not null;
 if not found then raise exception 'Member must complete onboarding before name correction'; end if;
end;
$$;
create function public.log_member_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.member_audit(actor_id,member_id,action) values(auth.uid(),new.id,
 case when TG_OP='INSERT' then 'member_created'
 when old.is_admin is distinct from new.is_admin then 'admin_permission_changed'
 when old.status is distinct from new.status then 'membership_' || new.status
 else 'profile_name_changed' end);
 return new;
end;
$$;
create trigger member_change after insert or update on public.members for each row execute function public.log_member_change();
-- No user-facing RPC can modify is_admin. The owner grants it manually in SQL.
revoke all on function public.eligible_identity(),public.active_member(),public.admin_member(),public.own_member(uuid,text),public.ensure_member(),public.complete_onboarding(text),public.set_member_status(uuid,text),public.correct_member_name(uuid,text),public.log_member_change() from public,anon,authenticated;
grant execute on function public.eligible_identity(),public.active_member(),public.admin_member(),public.own_member(uuid,text),public.ensure_member(),public.complete_onboarding(text),public.set_member_status(uuid,text),public.correct_member_name(uuid,text) to authenticated;
