-- Audience membership is captured at publication and never inferred on reads.
create table public.communication_groups (
 id uuid primary key, name text not null check(char_length(name) between 1 and 100 and btrim(name)<>'' and name !~ '[[:cntrl:]]'),
 version integer not null default 1 check(version>0), archived_at timestamptz
);
create unique index communication_group_names on public.communication_groups(lower(name)) where archived_at is null;
create table public.communication_group_members (
 group_id uuid references public.communication_groups(id) on delete cascade,
 member_id uuid references public.members(id) on delete cascade, primary key(group_id,member_id)
);
create table public.communication_posts (
 id uuid primary key,title text not null check(char_length(title) between 1 and 160 and btrim(title)<>'' and title !~ '[[:cntrl:]]'),
 body text not null check(char_length(body) between 1 and 6000 and btrim(body)<>''),
 kind text not null check(kind in ('announcement','task')),
 completion_mode text not null check(completion_mode in ('individual','shared')),
 audience_type text not null check(audience_type in ('individual','selected','group','segment','team')),
 audience_label text not null,audience_source_id uuid,due_on date,
 version integer not null default 1 check(version>0),archived_at timestamptz,
 created_at timestamptz not null default now(),created_by uuid references public.members(id) on delete set null,
 completed_at timestamptz,completed_by uuid references public.members(id) on delete set null,
 check(kind<>'announcement' or completion_mode='individual')
);
create table public.communication_recipients (
 post_id uuid references public.communication_posts(id) on delete cascade,
 member_id uuid references public.members(id) on delete cascade,completed_at timestamptz,primary key(post_id,member_id)
);
create index communication_recipients_member on public.communication_recipients(member_id,post_id);
create table public.communication_audit (
 id bigint generated always as identity primary key,post_id uuid references public.communication_posts(id) on delete cascade,
 group_id uuid references public.communication_groups(id) on delete cascade,actor_id uuid,action text not null,details jsonb not null,created_at timestamptz not null default now()
);
alter table public.communication_posts enable row level security;
alter table public.communication_recipients enable row level security;
alter table public.communication_groups enable row level security;
alter table public.communication_group_members enable row level security;
alter table public.communication_audit enable row level security;
revoke all on public.communication_posts,public.communication_recipients,public.communication_groups,public.communication_group_members,public.communication_audit from public,anon,authenticated;
grant select on public.communication_posts,public.communication_recipients,public.communication_groups,public.communication_group_members,public.communication_audit to authenticated;
-- A small definer predicate breaks the posts/recipients RLS cycle; exposes only current caller access.
create function public.communication_visible(target_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=target_id and p.archived_at is null and r.member_id=auth.uid())
$$;
create policy communication_posts_read on public.communication_posts for select to authenticated using(public.admin_member() or public.communication_visible(id));
create policy communication_recipients_read on public.communication_recipients for select to authenticated using(public.admin_member() or (member_id=auth.uid() and public.communication_visible(post_id)));
create policy communication_groups_read on public.communication_groups for select to authenticated using(public.admin_member());
create policy communication_group_members_read on public.communication_group_members for select to authenticated using(public.admin_member());
create policy communication_audit_read on public.communication_audit for select to authenticated using(public.admin_member());

create function public.save_communication_group(target_id uuid,expected_version integer,group_name text,member_ids uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_row public.communication_groups%rowtype;ids uuid[];clean_name text;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid group version';end if;
 clean_name:=btrim(group_name);
 if clean_name is null or char_length(clean_name) not between 1 and 100 or clean_name ~ '[[:cntrl:]]' then raise exception 'Invalid group name';end if;
 select * into old_row from public.communication_groups where id=target_id for update;
 if (found and (old_row.version<>expected_version or old_row.archived_at is not null)) or (not found and expected_version<>0) then raise exception 'Group changed. Refresh';end if;
 ids:=array(select distinct unnest(member_ids) order by 1);
 perform 1 from public.members where id=any(ids) order by id for share;
 if cardinality(ids)=0 or exists(select 1 from unnest(ids) i where i is null or not exists(select 1 from public.members m where m.id=i and m.status='active' and m.display_name is not null)) then raise exception 'Choose active dancers';end if;
 if old_row.id is null then insert into public.communication_groups(id,name) values(target_id,clean_name);
 else update public.communication_groups set name=clean_name,version=version+1 where id=target_id;end if;
 delete from public.communication_group_members where group_id=target_id;
 insert into public.communication_group_members select target_id,unnest(ids);
 insert into public.communication_audit(group_id,actor_id,action,details) values(target_id,auth.uid(),'group_saved',jsonb_build_object('name',clean_name,'members',ids,'version',expected_version+1));
 return target_id;
end;$$;
create function public.archive_communication_group(target_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 update public.communication_groups set archived_at=now(),version=version+1 where id=target_id and version=expected_version and archived_at is null;
 if not found then raise exception 'Group changed. Refresh';end if;
 insert into public.communication_audit(group_id,actor_id,action,details) values(target_id,auth.uid(),'group_archived',jsonb_build_object('version',expected_version+1));
end;$$;

create function public.save_communication(target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid default null,due_date date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_row public.communication_posts%rowtype;ids uuid[];label text;stored_ids uuid[];
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid post version';end if;
 if post_kind is null or post_kind not in ('announcement','task') or task_mode is null or task_mode not in ('individual','shared') or (post_kind='announcement' and task_mode<>'individual') or audience is null or audience not in ('individual','selected','group','segment','team') then raise exception 'Invalid communication options';end if;
 if post_title is null or char_length(btrim(post_title)) not between 1 and 160 or post_title ~ '[[:cntrl:]]' or post_body is null or char_length(btrim(post_body)) not between 1 and 6000 then raise exception 'Invalid title or message';end if;
 if (audience in ('group','segment') and source_id is null) or (audience not in ('group','segment') and source_id is not null) then raise exception 'Invalid audience source';end if;
 ids:=array(select distinct unnest(recipient_ids) order by 1);
 if audience not in ('individual','selected') and cardinality(ids)>0 then raise exception 'Invalid recipient options';end if;
 select * into old_row from public.communication_posts where id=target_id for update;
 if (found and (old_row.version<>expected_version or old_row.archived_at is not null)) or (not found and expected_version<>0) then raise exception 'Communication changed. Refresh';end if;
 if old_row.id is not null then
  select array_agg(member_id order by member_id) into stored_ids from public.communication_recipients where post_id=target_id;
  if post_kind<>old_row.kind or task_mode<>old_row.completion_mode or audience<>old_row.audience_type or source_id is distinct from old_row.audience_source_id or (audience in ('individual','selected') and ids is distinct from stored_ids) then raise exception 'Published audience, kind and completion mode are immutable';end if;
  update public.communication_posts set title=btrim(post_title),body=btrim(post_body),due_on=due_date,version=version+1 where id=target_id;
 else
  if audience='group' then
   select name into label from public.communication_groups where id=source_id and archived_at is null for share;
   if not found then raise exception 'Active group required';end if;
   ids:=array(select member_id from public.communication_group_members where group_id=source_id order by member_id);
  elsif audience='segment' then
   select name into label from public.segments where id=source_id and archived_at is null for share;
   if not found then raise exception 'Active segment required';end if;
   ids:=array(select member_id from public.segment_members where segment_id=source_id order by member_id);
  elsif audience='team' then
   label:='Whole team';ids:=array(select id from public.members where status='active' and display_name is not null order by id);
  elsif audience='individual' then label:='Individual';
  else label:='Selected dancers';end if;
  perform 1 from public.members where id=any(ids) order by id for share;
  -- Source groups may retain deactivated IDs: snapshot only their currently active members.
  if audience in ('team','group','segment') then ids:=array(select id from public.members where id=any(ids) and status='active' and display_name is not null order by id);end if;
  if cardinality(ids)=0 or (audience='individual' and cardinality(ids)<>1) or exists(select 1 from unnest(ids) i where i is null or not exists(select 1 from public.members m where m.id=i and m.status='active' and m.display_name is not null)) then raise exception 'Choose active recipients';end if;
  insert into public.communication_posts(id,title,body,kind,completion_mode,audience_type,audience_label,audience_source_id,due_on,created_by) values(target_id,btrim(post_title),btrim(post_body),post_kind,task_mode,audience,label,source_id,due_date,auth.uid());
  insert into public.communication_recipients(post_id,member_id) select target_id,unnest(ids);
 end if;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),case when old_row.id is null then 'created' else 'updated' end,jsonb_build_object('version',expected_version+1,'title',btrim(post_title),'body',btrim(post_body),'due_on',due_date,'recipients',case when old_row.id is null then ids else stored_ids end));
 return target_id;
end;$$;

create function public.complete_communication(target_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.communication_posts%rowtype;changed boolean:=false;
begin
 select * into p from public.communication_posts where id=target_id for update;
 if not public.active_member() or not exists(select 1 from public.communication_recipients where post_id=target_id and member_id=auth.uid()) then raise exception 'Assigned active member required';end if;
 if p.id is null or expected_version is null or p.version<>expected_version or p.archived_at is not null then raise exception 'Communication changed. Refresh';end if;
 if p.completion_mode='shared' then
  update public.communication_posts set completed_at=now(),completed_by=auth.uid() where id=target_id and completed_at is null;changed:=found;
 else
  update public.communication_recipients set completed_at=now() where post_id=target_id and member_id=auth.uid() and completed_at is null;changed:=found;
 end if;
 if changed then insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'completed',jsonb_build_object('version',p.version,'mode',p.completion_mode));end if;
end;$$;
create function public.manage_communication(target_id uuid,expected_version integer,operation text,recipient_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.communication_posts%rowtype;
begin
 if not public.admin_member() then raise exception 'Admin access required';end if;
 if operation is null or operation not in ('archive','restore','reopen') then raise exception 'Invalid operation';end if;
 select * into p from public.communication_posts where id=target_id for update;
 if p.id is null or expected_version is null or p.version<>expected_version or (operation='restore' and p.archived_at is null) or (operation<>'restore' and p.archived_at is not null) then raise exception 'Communication changed. Refresh';end if;
 if recipient_id is not null and (operation<>'reopen' or p.completion_mode='shared' or not exists(select 1 from public.communication_recipients where post_id=target_id and member_id=recipient_id)) then raise exception 'Invalid reopen recipient';end if;
 if operation='archive' then update public.communication_posts set archived_at=now() where id=target_id;
 elsif operation='restore' then update public.communication_posts set archived_at=null where id=target_id;
 elsif p.completion_mode='shared' then update public.communication_posts set completed_at=null,completed_by=null where id=target_id;
 else update public.communication_recipients set completed_at=null where post_id=target_id and (recipient_id is null or member_id=recipient_id);end if;
 update public.communication_posts set version=version+1 where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),operation,jsonb_build_object('version',expected_version+1,'recipient_id',recipient_id));
end;$$;
revoke all on function public.communication_visible(uuid),public.save_communication_group(uuid,integer,text,uuid[]),public.archive_communication_group(uuid,integer),public.save_communication(uuid,integer,text,text,text,text,text,uuid[],uuid,date),public.complete_communication(uuid,integer),public.manage_communication(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.communication_visible(uuid),public.save_communication_group(uuid,integer,text,uuid[]),public.archive_communication_group(uuid,integer),public.save_communication(uuid,integer,text,text,text,text,text,uuid[],uuid,date),public.complete_communication(uuid,integer),public.manage_communication(uuid,integer,text,uuid) to authenticated;
