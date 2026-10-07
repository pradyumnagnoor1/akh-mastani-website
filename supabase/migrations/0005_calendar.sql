-- A single complete snapshot; PostgreSQL owns all lease/freshness timestamps.
create table public.calendar_snapshot (
 id boolean primary key default true check(id),
 source_fingerprint text not null,
 events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array' and jsonb_array_length(events)<=1000),
 window_start timestamptz,
 window_end timestamptz,
 last_success_at timestamptz,
 last_attempt_at timestamptz,
 next_attempt_at timestamptz,
 last_error text check(last_error in ('authorization','upstream','timeout','invalid_response','capacity','storage')),
 lease_token uuid,
 lease_until timestamptz,
 check(window_end is null or window_end>window_start)
);
alter table public.calendar_snapshot enable row level security;
revoke all on public.calendar_snapshot from public,anon,authenticated;
grant select on public.calendar_snapshot to authenticated;
create policy calendar_active_read on public.calendar_snapshot for select to authenticated using(public.active_member());
-- service_role can execute the RPCs; no general table write permission is needed.
revoke all on public.calendar_snapshot from service_role;

create function public.calendar_claim_refresh(p_source text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare state public.calendar_snapshot; token uuid; stamp timestamptz := clock_timestamp();
begin
 if not exists(select 1 from public.members m join auth.users u on u.id=m.id where m.id=p_actor and m.status='active' and m.display_name is not null and m.email=lower(u.email) and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$' and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google') then raise exception 'Active membership required'; end if;
 if p_source is null or char_length(p_source) not between 1 and 128 then raise exception 'Invalid source';end if;
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
create function public.calendar_finish_refresh(p_source text,p_token uuid,p_events jsonb,p_window_start timestamptz,p_window_end timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); affected integer;
begin
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>1000 or p_window_start is null or p_window_end is null or p_window_end<=p_window_start then raise exception 'Invalid snapshot';end if;
 update public.calendar_snapshot set events=p_events,window_start=p_window_start,window_end=p_window_end,last_success_at=stamp,next_attempt_at=stamp+interval '300 seconds',last_error=null,lease_token=null,lease_until=null where id and source_fingerprint=p_source and lease_token=p_token and lease_until>stamp;
 get diagnostics affected=row_count;return affected=1;
end;
$$;
create function public.calendar_fail_refresh(p_source text,p_token uuid,p_error_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();affected integer;
begin
 if p_error_code is null or p_error_code not in ('authorization','upstream','timeout','invalid_response','capacity','storage') then raise exception 'Invalid failure';end if;
 update public.calendar_snapshot set last_error=p_error_code,next_attempt_at=stamp+interval '60 seconds',lease_token=null,lease_until=null where id and source_fingerprint=p_source and lease_token=p_token and lease_until>stamp;
 get diagnostics affected=row_count;return affected=1;
end;
$$;
revoke all on function public.calendar_claim_refresh(text,uuid),public.calendar_finish_refresh(text,uuid,jsonb,timestamptz,timestamptz),public.calendar_fail_refresh(text,uuid,text) from public,anon,authenticated;
grant execute on function public.calendar_claim_refresh(text,uuid),public.calendar_finish_refresh(text,uuid,jsonb,timestamptz,timestamptz),public.calendar_fail_refresh(text,uuid,text) to service_role;
