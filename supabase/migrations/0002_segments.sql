-- Named segments, one source of dancer assignments, and private immutable PDF uploads.
create table public.segments (
 id uuid primary key,
 name text not null check(char_length(name) between 1 and 100 and btrim(name)<>'' and name !~ '[[:cntrl:]]'),
 document_path text not null,
 document_label text not null check(char_length(document_label) between 1 and 200),
 version integer not null default 1 check(version>0),
 archived_at timestamptz,
 created_by uuid references public.members(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index segments_active_name on public.segments(lower(name)) where archived_at is null;
create table public.segment_members (
 segment_id uuid not null references public.segments(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete cascade,
 primary key(segment_id,member_id)
);
create index segment_members_by_member on public.segment_members(member_id);
create table public.segment_audit (
 id bigint generated always as identity primary key,
 segment_id uuid not null references public.segments(id) on delete cascade,
 actor_id uuid,
 action text not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.segments enable row level security;
alter table public.segment_members enable row level security;
alter table public.segment_audit enable row level security;
revoke all on public.segments,public.segment_members,public.segment_audit from public,anon,authenticated;
grant select on public.segments,public.segment_members,public.segment_audit to authenticated;
create policy segments_read on public.segments for select to authenticated using(public.active_member() and (archived_at is null or public.admin_member()));
create policy segment_members_read on public.segment_members for select to authenticated using(public.active_member() and exists(select 1 from public.segments s where s.id=segment_id and (s.archived_at is null or public.admin_member())));
create policy segment_audit_read on public.segment_audit for select to authenticated using(public.admin_member());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('formations','formations',false,4194304,array['application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=4194304,allowed_mime_types=array['application/pdf'];
-- No UPDATE or DELETE policy: replacement uses a new object key, preserving prior files.
create policy formations_upload on storage.objects for insert to authenticated with check(
 bucket_id='formations' and public.admin_member()
 and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.]pdf$')
);
create policy formations_read on storage.objects for select to authenticated using(
 -- Require the server-controlled Storage operation; signing/listing/S3 reads fail closed.
 bucket_id='formations' and storage.allow_only_operation('object.get_authenticated') and public.active_member() and
 (public.admin_member() or exists(select 1 from public.segments s where s.document_path=storage.objects.name and s.archived_at is null))
);

create function public.save_segment(target_id uuid,expected_version integer,segment_name text,member_ids uuid[],pdf_path text,pdf_label text) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_row public.segments%rowtype; clean_name text; ids uuid[]; updated_version integer;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid segment version';end if;
 if segment_name is null or segment_name ~ '[[:cntrl:]]' then raise exception 'Enter a valid segment name';end if;
 clean_name := btrim(regexp_replace(segment_name,'[[:space:]]+',' ','g'));
 if char_length(clean_name) not between 1 and 100 then raise exception 'Segment name must be 1–100 characters';end if;
 select * into old_row from public.segments where id=target_id for update;
 if (found and (old_row.version<>expected_version or old_row.archived_at is not null)) or (not found and expected_version<>0) then
  raise exception 'Segment changed. Refresh before saving again';
 end if;
 ids := coalesce(array(select distinct unnest(member_ids)),array[]::uuid[]);
 -- Prevent deactivation while this transaction snapshots the assignment set.
 perform 1 from public.members where id=any(ids) for share;
 if exists(select 1 from unnest(ids) i where i is null or not exists(select 1 from public.members m where m.id=i and m.status='active' and m.display_name is not null)) then
  raise exception 'Assignments must reference active dancers';
 end if;
 if pdf_path is null or pdf_label is null or char_length(pdf_label) not between 1 and 200 or pdf_label ~ '[[:cntrl:]]' then raise exception 'Formation PDF required';end if;
 if pdf_path is distinct from old_row.document_path then
  if pdf_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.]pdf$') then raise exception 'PDF must be uploaded by this admin';end if;
 end if;
 if not exists(select 1 from storage.objects where bucket_id='formations' and name=pdf_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 4194304) then raise exception 'Uploaded PDF not found or invalid';end if;
 if old_row.id is null then
  insert into public.segments(id,name,document_path,document_label,created_by) values(target_id,clean_name,pdf_path,pdf_label,auth.uid());
  updated_version:=1;
 else
  update public.segments set name=clean_name,document_path=pdf_path,document_label=pdf_label,version=version+1,updated_at=now() where id=target_id;
  updated_version:=old_row.version+1;
 end if;
 delete from public.segment_members where segment_id=target_id;
 insert into public.segment_members(segment_id,member_id) select target_id,unnest(ids);
 insert into public.segment_audit(segment_id,actor_id,action,details) values(target_id,auth.uid(),case when old_row.id is null then 'created' else 'updated' end,
 jsonb_build_object('name',clean_name,'version',updated_version,'members',ids,'previous_document_path',old_row.document_path,'document_path',pdf_path));
 return target_id;
end;
$$;
create function public.archive_segment(target_id uuid,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 update public.segments set archived_at=now(),updated_at=now(),version=version+1 where id=target_id and version=expected_version and archived_at is null;
 if not found then raise exception 'Segment changed. Refresh before removing it';end if;
 insert into public.segment_audit(segment_id,actor_id,action,details) values(target_id,auth.uid(),'archived',jsonb_build_object('version',expected_version+1));
end;
$$;
revoke all on function public.save_segment(uuid,integer,text,uuid[],text,text),public.archive_segment(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_segment(uuid,integer,text,uuid[],text,text),public.archive_segment(uuid,integer) to authenticated;
