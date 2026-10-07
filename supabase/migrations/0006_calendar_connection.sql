-- The singleton survives disconnects so outstanding callbacks cannot resurrect an old version.
create table public.calendar_connection (
 id boolean primary key default true check(id),
 version bigint not null default 0 check(version>=0),
 calendar_id text,
 client_id text,
 encrypted_token text,
 connected_by uuid references public.members(id),
 connected_at timestamptz
);
insert into public.calendar_connection(id) values(true);
-- The prior environment connection is disabled; do not retain its readable snapshot.
delete from public.calendar_snapshot where id;
create table public.calendar_connection_attempts (
 state_hash text primary key check(char_length(state_hash)=64 and state_hash ~ '^[0-9a-f]+$'),
 actor uuid not null references public.members(id) on delete cascade,
 expected_version bigint not null,
 expires_at timestamptz not null
);
alter table public.calendar_connection enable row level security;
alter table public.calendar_connection_attempts enable row level security;
revoke all on public.calendar_connection,public.calendar_connection_attempts from public,anon,authenticated,service_role;

-- Holding the member lock until commit serializes permission changes against mutations.
create function public.calendar_require_admin(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.members m join auth.users u on u.id=m.id
 where m.id=p_actor and m.status='active' and m.is_admin and m.display_name is not null
 and m.email=lower(u.email) and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$'
 and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google'
 for share of m;
 if not found then raise exception 'Admin access required'; end if;
end;
$$;
create function public.calendar_read_connection() returns jsonb
language sql security definer set search_path='' as $$
 select to_jsonb(c) from public.calendar_connection c where id;
$$;
create function public.calendar_connection_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required'; end if;
 return (select jsonb_build_object('version',version,'calendar_id',calendar_id,'connected_at',connected_at) from public.calendar_connection where id);
end;
$$;
create function public.begin_calendar_connection(p_actor uuid,p_state_hash text) returns bigint
language plpgsql security definer set search_path='' as $$
declare current_version bigint;
begin
 perform public.calendar_require_admin(p_actor);
 delete from public.calendar_connection_attempts where expires_at<=clock_timestamp();
 select version into current_version from public.calendar_connection where id for share;
 insert into public.calendar_connection_attempts(state_hash,actor,expected_version,expires_at)
 values(p_state_hash,p_actor,current_version,clock_timestamp()+interval '10 minutes');
 return current_version;
end;
$$;
create function public.consume_calendar_connection(p_actor uuid,p_state_hash text) returns bigint
language plpgsql security definer set search_path='' as $$
declare expected bigint;
begin
 perform public.calendar_require_admin(p_actor);
 delete from public.calendar_connection_attempts where state_hash=p_state_hash and actor=p_actor and expires_at>clock_timestamp() returning expected_version into expected;
 if not found then raise exception 'Invalid or expired calendar connection attempt'; end if;
 return expected;
end;
$$;
create function public.save_calendar_connection(p_actor uuid,p_expected_version bigint,p_calendar_id text,p_client_id text,p_encrypted_token text) returns bigint
language plpgsql security definer set search_path='' as $$
declare next_version bigint;
begin
 perform public.calendar_require_admin(p_actor);
 if p_calendar_id is null or char_length(btrim(p_calendar_id)) not between 1 and 1024 or p_client_id is null or char_length(btrim(p_client_id)) not between 1 and 1024 or p_encrypted_token is null or char_length(p_encrypted_token) not between 1 and 16384 then raise exception 'Invalid calendar connection'; end if;
 update public.calendar_connection set version=version+1,calendar_id=p_calendar_id,client_id=p_client_id,encrypted_token=p_encrypted_token,connected_by=p_actor,connected_at=clock_timestamp() where id and version=p_expected_version returning version into next_version;
 if not found then raise exception 'Calendar connection version changed'; end if;
 delete from public.calendar_snapshot where id;
 return next_version;
end;
$$;
create function public.disconnect_calendar_connection(p_actor uuid,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare next_version bigint;
begin
 perform public.calendar_require_admin(p_actor);
 update public.calendar_connection set version=version+1,calendar_id=null,client_id=null,encrypted_token=null,connected_by=null,connected_at=null where id and version=p_expected_version returning version into next_version;
 if not found then raise exception 'Calendar connection version changed'; end if;
 delete from public.calendar_snapshot where id;
 return next_version;
end;
$$;
revoke all on function public.calendar_require_admin(uuid),public.calendar_read_connection(),public.calendar_connection_status(),public.begin_calendar_connection(uuid,text),public.consume_calendar_connection(uuid,text),public.save_calendar_connection(uuid,bigint,text,text,text),public.disconnect_calendar_connection(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.calendar_connection_status() to authenticated;
grant execute on function public.calendar_read_connection(),public.begin_calendar_connection(uuid,text),public.consume_calendar_connection(uuid,text),public.save_calendar_connection(uuid,bigint,text,text,text),public.disconnect_calendar_connection(uuid,bigint) to service_role;

-- A loaded obsolete configuration cannot recreate a cleared snapshot.
create or replace function public.calendar_claim_refresh(p_source text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare connection public.calendar_connection; state public.calendar_snapshot; token uuid; stamp timestamptz := clock_timestamp();
begin
 if not exists(select 1 from public.members m join auth.users u on u.id=m.id where m.id=p_actor and m.status='active' and m.display_name is not null and m.email=lower(u.email) and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google') then raise exception 'Active membership required'; end if;
 if p_source is null or char_length(p_source) not between 1 and 128 then raise exception 'Invalid source';end if;
 select * into connection from public.calendar_connection where id for share;
 if not found or (connection.calendar_id is null or connection.client_id is null or connection.encrypted_token is null or p_source<>encode(sha256(convert_to('connected:'||connection.version::text||':'||connection.client_id||':'||connection.calendar_id,'UTF8')),'hex')) then return null; end if;
 insert into public.calendar_snapshot(id,source_fingerprint) values(true,p_source) on conflict(id) do nothing;
 select * into state from public.calendar_snapshot where id for update;
 if state.source_fingerprint<>p_source then
   update public.calendar_snapshot set source_fingerprint=p_source,events='[]',window_start=null,window_end=null,last_success_at=null,last_attempt_at=null,next_attempt_at=null,last_error=null,lease_token=null,lease_until=null where id;
 else
   if state.lease_until>stamp or state.next_attempt_at>stamp or state.last_success_at>stamp-interval '300 seconds' then return null;end if;
 end if;
 token:=gen_random_uuid();
 update public.calendar_snapshot set lease_token=token,lease_until=stamp+interval '30 seconds',last_attempt_at=stamp where id;
 return token;
end;
$$;
