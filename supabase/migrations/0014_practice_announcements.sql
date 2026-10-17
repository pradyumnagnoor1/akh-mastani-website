-- Exec permissions, attributed practice announcements and one shared practice reminder.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0014',0));
alter table public.members add column exec_roles text[] not null default '{}'
 check(exec_roles <@ array['Captain','Logistics & Finance','Production','Social']::text[] and array_position(exec_roles,null) is null);
create function public.exec_member() returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.members where id=auth.uid() and cardinality(exec_roles)>0);
$$;
create or replace function public.admin_member() returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.members where id=auth.uid() and (is_admin or cardinality(exec_roles)>0));
$$;
-- The original manually assigned admin permission is owner-controlled. Execs cannot grant roles.
create function public.set_exec_roles(target_id uuid,roles text[],expected_roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.active_member() or not exists(select 1 from public.members where id=auth.uid() and is_admin) then raise exception 'Owner access required';end if;
 if roles is null or not roles <@ array['Captain','Logistics & Finance','Production','Social']::text[] or array_position(roles,null) is not null then raise exception 'Choose valid exec roles';end if;
 update public.members set exec_roles=array(select distinct unnest(roles) order by 1) where id=target_id and status='active' and exec_roles=expected_roles;
 if not found then raise exception 'Member roles changed or member is inactive. Refresh';end if;
end;$$;
create or replace function public.log_member_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_audit(actor_id,member_id,action) values(auth.uid(),new.id,
 case when TG_OP='INSERT' then 'member_created'
 when old.is_admin is distinct from new.is_admin then 'admin_permission_changed'
 when old.exec_roles is distinct from new.exec_roles then 'exec_roles_changed'
 when old.status is distinct from new.status then 'membership_'||new.status
 else 'profile_name_changed' end);
 return new;
end;$$;
alter table public.communication_posts add column author_name text;
alter table public.communication_posts add column author_exec_role text check(author_exec_role in ('Captain','Logistics & Finance','Production','Social'));
alter table public.communication_posts add column edited_at timestamptz;
alter table public.communication_posts add column practice_event_id text;
alter table public.communication_posts add column practice_source text;
alter table public.communication_posts add column practice_snapshot jsonb;
alter table public.communication_posts add constraint practice_link_complete check(
 (practice_event_id is null and practice_source is null and practice_snapshot is null) or
 (kind='announcement' and practice_event_id is not null and practice_source is not null and practice_snapshot is not null));
create index communication_practice on public.communication_posts(practice_source,practice_event_id) where practice_event_id is not null;
update public.communication_posts p set author_name=m.display_name from public.members m where m.id=p.created_by;
create function public.practice_identity(e jsonb) returns text language sql immutable set search_path='' as $$
 select case when nullif(e->>'recurringEventId','') is not null and nullif(e->>'originalStart','') is not null
 then (e->>'recurringEventId')||'@'||(e->>'originalStart') else e->>'id' end;
$$;
create function public.communication_manager(target_id uuid,post_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select public.admin_member();
$$;
create or replace function public.communication_access(target_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.active_member() and exists(select 1 from public.communication_posts p where p.id=target_id and p.archived_at is null and (p.expires_at is null or p.expires_at>now()) and
 (public.admin_member() or (public.exec_member() and p.created_by=auth.uid()) or exists(select 1 from public.communication_recipients r where r.post_id=p.id and r.member_id=auth.uid())));
$$;
drop policy communication_recipients_read on public.communication_recipients;
create policy communication_recipients_read on public.communication_recipients for select to authenticated using(public.communication_access(post_id) and
 (public.admin_member() or member_id=auth.uid() or (public.exec_member() and exists(select 1 from public.communication_posts p where p.id=post_id and p.created_by=auth.uid()))));
drop policy upload_owner_read on public.announcement_uploads;
create policy upload_owner_read on public.announcement_uploads for select to authenticated using((public.admin_member() or public.exec_member()) and owner_id=auth.uid());
create policy exec_group_choices on public.communication_groups for select to authenticated using(public.exec_member());
create policy exec_group_members_choices on public.communication_group_members for select to authenticated using(public.exec_member());
-- Public team segment choices already follow active-member policies; files remain protected.
create function public.communication_metadata() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then select display_name,exec_roles[1] into new.author_name,new.author_exec_role from public.members where id=new.created_by;
 else
  new.author_name:=old.author_name;
  if old.created_at<transaction_timestamp() and row(new.title,new.body,new.image_path,new.image_description,new.practice_event_id,new.practice_source,new.expires_at) is distinct from row(old.title,old.body,old.image_path,old.image_description,old.practice_event_id,old.practice_source,old.expires_at) then new.edited_at:=now();end if;
 end if;
 if new.practice_event_id is not null then new.reminder_at:=null;new.reminder_mode:=null;new.reminder_message:='';new.reminder_task_id:=null;end if;
 return new;
end;$$;
create trigger communication_metadata before insert or update on public.communication_posts for each row execute function public.communication_metadata();


create or replace function public.save_communication(target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid default null,due_date date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_row public.communication_posts%rowtype;ids uuid[];label text;stored_ids uuid[];
begin
 if not public.communication_manager(target_id,post_kind) then raise exception 'Announcement management access required';end if;
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

create or replace function public.save_communication_media(target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text) returns uuid language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz;prior_image text;u public.announcement_uploads;
begin
 if not public.communication_manager(target_id,post_kind) then raise exception 'Announcement management access required';end if;
 cutoff:=public.expiration_cutoff(expiration_date);
 if char_length(coalesce(image_alt,''))>200 or (post_kind<>'announcement' and image_object is not null) then raise exception 'Invalid image';end if;
 -- Core RPC obtains the item lock/version check. Entire wrapper is one transaction.
 perform public.save_communication(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date);
 select image_path into prior_image from public.communication_posts where id=target_id;
 if image_object is not null and image_object is distinct from prior_image then
  select * into u from public.announcement_uploads where path=image_object for update;
  if u.path is null or u.post_id<>target_id or u.owner_id is distinct from auth.uid() or u.state<>'pending' or not u.validated or u.created_at<=now()-interval '1 hour' or not exists(select 1 from storage.objects where bucket_id='announcement-images' and name=image_object) then raise exception 'Image unavailable. Choose it again';end if;
  update public.announcement_uploads set state='attached' where path=image_object;
 end if;
 update public.communication_posts set expires_at=cutoff,image_path=image_object,image_description=case when image_object is null then '' else coalesce(image_alt,'') end where id=target_id;
 return target_id;
end;$$;

create or replace function public.save_communication_reminder(
 target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text,
 reminder_time timestamptz,reminder_type text,reminder_text text,linked_task uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.communication_posts; result uuid; changed boolean;
begin
 if not public.communication_manager(target_id,post_kind) then raise exception 'Announcement management access required';end if;
 select * into p from public.communication_posts where id=target_id for update;
 changed:=row(p.reminder_at,p.reminder_mode,p.reminder_message,p.reminder_task_id) is distinct from row(reminder_time,reminder_type,coalesce(reminder_text,''),linked_task);
 if reminder_time is not null then
  if post_kind<>'announcement' or reminder_type is null or reminder_type not in ('acknowledgment','preparation','linked-task') then raise exception 'Choose an announcement reminder type';end if;
  if changed and (reminder_time<=now() or reminder_time>now()+interval '366 days') then raise exception 'Choose a future reminder within one year';end if;
  if char_length(coalesce(reminder_text,''))>200 or coalesce(reminder_text,'') ~ '[[:cntrl:]]' then raise exception 'Use a reminder message of up to 200 characters';end if;
  if expiration_date is not null and reminder_time>=((expiration_date+1)::timestamp at time zone 'America/Chicago') then raise exception 'Reminder must be before announcement expiration';end if;
  if reminder_type='linked-task' and not exists(select 1 from public.communication_posts t where t.id=linked_task and t.kind='task' and t.archived_at is null and (t.expires_at is null or t.expires_at>now())) then raise exception 'Choose a live linked task';end if;
 elsif reminder_type is not null or linked_task is not null or coalesce(reminder_text,'')<>'' then raise exception 'Choose a reminder time';end if;
 if reminder_type is distinct from 'linked-task' and linked_task is not null then raise exception 'Only task reminders may link a task';end if;
 result:=public.save_communication_media(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date,expiration_date,image_object,image_alt);
 update public.communication_posts set reminder_at=reminder_time,reminder_mode=reminder_type,reminder_message=coalesce(reminder_text,''),reminder_task_id=linked_task,
 reminder_revision=reminder_revision+case when changed then 1 else 0 end,
 version=version+case when changed and p.id is not null and version=expected_version then 1 else 0 end where id=target_id;
 if changed and reminder_time is not null or changed and p.reminder_at is not null then
  insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'reminder_saved',jsonb_build_object('time',reminder_time,'type',reminder_type,'message',coalesce(reminder_text,''),'task',linked_task));
 end if;
 return result;
end;$$;

create or replace function public.reserve_announcement_image(target_id uuid,expected_version integer) returns text language plpgsql security definer set search_path='' as $$
declare p public.communication_posts;object_path text;
begin
 if not public.communication_manager(target_id,'announcement') then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<0 then raise exception 'Invalid version';end if;
 perform pg_advisory_xact_lock(hashtextextended('image-owner:'||auth.uid()::text,0));
 select * into p from public.communication_posts where id=target_id for update;
 if (p.id is null and expected_version<>0) or (p.id is not null and (p.kind<>'announcement' or p.version<>expected_version or p.archived_at is not null or p.expires_at<=now())) then raise exception 'Announcement changed. Refresh';end if;
 if (select count(*) from public.announcement_uploads where owner_id=auth.uid() and state='pending' and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many unfinished images. Remove one or try later';end if;
 object_path:=auth.uid()::text||'/'||gen_random_uuid()::text||'.jpg';
 insert into public.announcement_uploads(path,post_id,owner_id) values(object_path,target_id,auth.uid());
 return object_path;
end;$$;

create or replace function public.delete_team_item(target_id uuid,expected_version integer,item_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (public.admin_member() or (item_kind='communication' and public.communication_manager(target_id,'announcement'))) then raise exception 'Admin access required';end if;
 if target_id is null or expected_version is null or expected_version<1 then raise exception 'Invalid item version';end if;
 case item_kind
 when 'communication' then delete from public.communication_posts where id=target_id and version=expected_version;
 when 'group' then delete from public.communication_groups where id=target_id and version=expected_version;
 when 'segment' then delete from public.segments where id=target_id and version=expected_version;
 when 'featured' then delete from public.featured_events where id=target_id and version=expected_version;
 else raise exception 'Invalid item kind';
 end case;
 if not found then raise exception 'Item changed. Refresh';end if;
end;$$;

create or replace function public.manage_communication(target_id uuid,expected_version integer,operation text,recipient_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.communication_posts;
begin
 if not public.communication_manager(target_id,(select kind from public.communication_posts where id=target_id)) then raise exception 'Admin access required';end if;
 if operation in ('delete','archive') then perform public.delete_team_item(target_id,expected_version,'communication');return;end if;
 if operation is distinct from 'reopen' then raise exception 'Invalid operation. Deleted items cannot be restored';end if;
 select * into p from public.communication_posts where id=target_id for update;
 if p.id is null or expected_version is null or p.version<>expected_version or p.archived_at is not null then raise exception 'Communication changed. Refresh';end if;
 if recipient_id is not null and (p.completion_mode='shared' or not exists(select 1 from public.communication_recipients where post_id=target_id and member_id=recipient_id)) then raise exception 'Invalid reopen recipient';end if;
 if p.completion_mode='shared' then update public.communication_posts set completed_at=null,completed_by=null where id=target_id;
 else update public.communication_recipients set completed_at=null where post_id=target_id and (recipient_id is null or member_id=recipient_id);end if;
 update public.communication_posts set version=version+1 where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'reopen',jsonb_build_object('version',expected_version+1,'recipient_id',recipient_id));
end;$$;

create or replace function public.abandon_announcement_image(object_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (public.admin_member() or public.exec_member()) then raise exception 'Announcement management access required';end if;
 update public.announcement_uploads set state='cleanup',cleanup_after=now()+interval '2 minutes' where path=object_path and owner_id=auth.uid() and state='pending';
end;$$;

create or replace function public.calendar_require_admin(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.members m join auth.users u on u.id=m.id
 where m.id=p_actor and m.status='active' and (m.is_admin or cardinality(m.exec_roles)>0) and m.display_name is not null
 and m.email=lower(u.email) and lower(u.email) ~ '^[^@[:space:]]+@tamu[.]edu$'
 and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google'
 for share of m;
 if not found then raise exception 'Admin access required'; end if;
end;
$$;


create function public.save_announcement(
 target_id uuid,expected_version integer,post_kind text,post_title text,post_body text,task_mode text,audience text,recipient_ids uuid[],source_id uuid,due_date date,expiration_date date,image_object text,image_alt text,
 reminder_time timestamptz,reminder_type text,reminder_text text,linked_task uuid,posting_role text,practice_id text,calendar_source text
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.communication_posts;e jsonb;source text;
begin
 if not public.communication_manager(target_id,post_kind) then raise exception 'Announcement management access required';end if;
 select * into prior from public.communication_posts where id=target_id for update;
 if prior.id is not null and prior.version<>expected_version then raise exception 'Announcement changed. Refresh';end if;
 if prior.id is null then
  if posting_role is not null and not exists(select 1 from public.members where id=auth.uid() and posting_role=any(exec_roles)) then raise exception 'Choose one of your assigned exec roles';end if;
  if public.exec_member() and posting_role is null and post_kind='announcement' then raise exception 'Choose a posting role';end if;
 elsif posting_role is distinct from prior.author_exec_role then raise exception 'Original posting role cannot change';end if;
 if practice_id is not null then
  if post_kind<>'announcement' then raise exception 'Only announcements can link a practice';end if;
  select s.source_fingerprint,x into source,e from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) x
   where s.last_success_at>now()-interval '15 minutes' and public.push_calendar_current(s.source_fingerprint) and s.source_fingerprint=calendar_source and public.practice_identity(x)=practice_id and x->>'allDay'='false';
  if e is null then
   if prior.practice_event_id=practice_id and prior.practice_source=calendar_source then e:=prior.practice_snapshot;source:=prior.practice_source;
   else raise exception 'Practice unavailable. Refresh the calendar and choose a practice';end if;
  elsif prior.practice_event_id is distinct from practice_id or prior.practice_source is distinct from calendar_source then
   if (e->>'start')::timestamptz<=now() then raise exception 'Choose an upcoming practice';end if;
  end if;
  reminder_time:=null;reminder_type:=null;reminder_text:='';linked_task:=null;
 end if;
 perform public.save_communication_reminder(target_id,expected_version,post_kind,post_title,post_body,task_mode,audience,recipient_ids,source_id,due_date,expiration_date,image_object,image_alt,reminder_time,reminder_type,reminder_text,linked_task);
 update public.communication_posts set author_exec_role=posting_role,practice_event_id=practice_id,practice_source=source,practice_snapshot=e where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'practice_link_saved',jsonb_build_object('practice',practice_id,'source',source,'posting_role',posting_role));
 return target_id;
end;$$;
-- Live schedule lookup never leaks linked notes; callers must separately authorize each post.
create function public.practice_event(p_source text,p_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select e from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) e where s.source_fingerprint=p_source and public.push_calendar_current(s.source_fingerprint) and public.practice_identity(e)=p_id limit 1;
$$;
create function public.practice_preview(p_event jsonb,p_source text,p_member uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare notes text;day text;heading text;
begin
 select string_agg(left(btrim(regexp_replace(p.body,'[[:space:]]+',' ','g')),120),' · ' order by p.created_at desc,p.id) into notes
 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id
 where r.member_id=p_member and p.practice_source=p_source and p.practice_event_id=public.practice_identity(p_event) and p.archived_at is null and (p.expires_at is null or p.expires_at>now());
 day:=case when ((p_event->>'start')::timestamptz at time zone 'America/Chicago')::date=(now() at time zone 'America/Chicago')::date then 'today' else to_char((p_event->>'start')::timestamptz at time zone 'America/Chicago','Mon FMDD') end;
 heading:='Practice '||day||' at '||to_char((p_event->>'start')::timestamptz at time zone 'America/Chicago','FMHH12:MI AM')||case when nullif(p_event->>'location','') is not null then ' · '||(p_event->>'location') else '' end;
 return jsonb_build_object('title',left(heading,180),'body',left(coalesce(notes,'Open the calendar for practice details.'),240),'url','/calendar?date='||to_char((p_event->>'start')::timestamptz at time zone 'America/Chicago','YYYY-MM-DD')||'&event='||(p_event->>'id'));
end;$$;


create or replace function public.nudge_valid(o public.nudge_occurrences,stamp timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select public.nudge_member_enabled(o.member_id) and public.push_member_active(o.member_id) and o.expires_at>stamp and case o.source_kind
 when 'task' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='task' and p.due_on::text=o.source_token and r.member_id=o.member_id and r.completed_at is null and p.completed_at is null and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp))
 when 'payment' then exists(select 1 from public.payment_charges c where c.id=o.source_id and c.member_id=o.member_id and c.due_on::text=o.source_token and c.status='unpaid')
 when 'announcement' then exists(select 1 from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.id=o.source_id and p.kind='announcement' and p.practice_event_id is null and p.reminder_revision::text=o.source_token and p.reminder_at is not null and r.member_id=o.member_id and p.archived_at is null and (p.expires_at is null or p.expires_at>stamp) and
  case p.reminder_mode when 'preparation' then true when 'acknowledgment' then r.completed_at is null when 'linked-task' then exists(select 1 from public.communication_posts t join public.communication_recipients tr on tr.post_id=t.id where t.id=p.reminder_task_id and t.kind='task' and tr.member_id=o.member_id and tr.completed_at is null and t.completed_at is null and t.archived_at is null and (t.expires_at is null or t.expires_at>stamp)) else false end)
 when 'practice' then exists(select 1 from public.calendar_snapshot c where c.last_success_at>stamp-interval '15 minutes' and public.push_calendar_current(c.source_fingerprint) and exists(select 1 from jsonb_array_elements(c.events) e where 'practice:'||(e->>'id')||':'||(e->>'start')=o.source_token and e->>'allDay'='false' and (e->>'start')::timestamptz>stamp))
 else false end;
$$;

create or replace function public.nudge_enqueue(stamp timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<schedule>>
declare day date:=(stamp at time zone 'America/Chicago')::date;clock time:=(stamp at time zone 'America/Chicago')::time;
 m record; c record; e jsonb; stage text;scheduled timestamptz;expiry timestamptz;starts timestamptz;local_start timestamp;token text;key text;bid uuid;quota integer;payload jsonb;n integer;total integer:=0;ids uuid[];
begin
 -- Only a short delivery window is generated; outages never replay every past stage.
 for c in select p.id,p.due_on,p.expires_at,r.member_id from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.kind='task' and p.archived_at is null and p.completed_at is null and r.completed_at is null and p.due_on between day-1 and day+1 loop
  stage:=case when c.due_on=day+1 then 'before' when c.due_on=day then 'due' else 'follow-up' end;
  scheduled:=(day+case when stage='before' then time '18:00' else time '09:00' end) at time zone 'America/Chicago';
  expiry:=least((day+time '22:00') at time zone 'America/Chicago',coalesce(c.expires_at,(day+time '22:00') at time zone 'America/Chicago'));
  if scheduled>stamp or expiry<=stamp or not public.nudge_member_enabled(c.member_id) then continue;end if;
  key:='task:'||c.id||':'||stage||':'||c.due_on;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,key,'task',c.id,c.due_on::text,stage,case when stage='due' then 2 else 3 end,scheduled,expiry) on conflict(member_id,event_key) do nothing;
 end loop;
 for c in select id,member_id,due_on from public.payment_charges where status='unpaid' and due_on between day-1 and day loop
  if not public.nudge_member_enabled(c.member_id) then continue;end if;
  stage:=case when c.due_on=day then 'due' else 'follow-up' end;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,'payment:'||c.id||':'||stage||':'||c.due_on,'payment',c.id,c.due_on::text,stage,case when stage='due' then 2 else 3 end,(day+time '09:00') at time zone 'America/Chicago',(day+time '22:00') at time zone 'America/Chicago') on conflict(member_id,event_key) do nothing;
 end loop;
 for c in select p.*,r.member_id from public.communication_posts p join public.communication_recipients r on r.post_id=p.id where p.kind='announcement' and p.practice_event_id is null and p.reminder_at is not null and p.archived_at is null and p.reminder_at>stamp-interval '2 days' and p.reminder_at<=stamp loop
  if not public.nudge_member_enabled(c.member_id) then continue;end if;
  local_start:=c.reminder_at at time zone 'America/Chicago';
  if local_start::time>=time '22:00' then scheduled:=((local_start::date+1)+time '09:00') at time zone 'America/Chicago';
  elsif local_start::time<time '09:00' then scheduled:=(local_start::date+time '09:00') at time zone 'America/Chicago';else scheduled:=c.reminder_at;end if;
  -- Author-selected reminders have a bounded six-hour useful window, ending at quiet hours/expiry.
  expiry:=least(scheduled+interval '6 hours',((scheduled at time zone 'America/Chicago')::date+time '22:00') at time zone 'America/Chicago',coalesce(c.expires_at,scheduled+interval '6 hours'));
  if scheduled>stamp or expiry<=stamp then continue;end if;
  insert into public.nudge_occurrences(member_id,event_key,source_kind,source_id,source_token,stage,priority,available_at,expires_at)
  values(c.member_id,'announcement:'||c.id||':'||c.reminder_revision,'announcement',c.id,c.reminder_revision::text,'author',case when c.reminder_mode='preparation' then 1 else 2 end,scheduled,expiry) on conflict(member_id,event_key) do nothing;
 end loop;
 for e in select value from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) where s.last_success_at>stamp-interval '15 minutes' and public.push_calendar_current(s.source_fingerprint) loop
  if e->>'allDay'<>'false' then continue;end if;
  begin starts:=(e->>'start')::timestamptz;exception when others then continue;end;
  scheduled:=starts-interval '60 minutes';local_start:=scheduled at time zone 'America/Chicago';
  -- Advance a quiet-hours practice reminder only when <= two hours before start.
  if local_start::time>=time '22:00' then scheduled:=(local_start::date+time '21:55') at time zone 'America/Chicago';
  elsif local_start::time<time '09:00' then scheduled:=((local_start::date-1)+time '21:55') at time zone 'America/Chicago';end if;
  if starts-scheduled>interval '2 hours' or scheduled>stamp or starts<=stamp or stamp>scheduled+interval '30 minutes' then continue;end if;
  token:='practice:'||(e->>'id')||':'||(e->>'start');
  for m in select id from public.members where public.nudge_member_enabled(id) loop
   insert into public.nudge_occurrences(member_id,event_key,source_kind,source_token,stage,priority,available_at,expires_at)
   values(m.id,token,'practice',token,'practice',0,scheduled,starts) on conflict(member_id,event_key) do nothing;
  end loop;
 end loop;
 -- Legacy already-sent due/practice reminders must not be replayed at enable time.
 update public.nudge_occurrences o set state='suppressed' where state='pending' and exists(select 1 from public.push_jobs j join public.push_subscriptions s on s.id=j.subscription_id where s.member_id=o.member_id and j.status='sent' and j.event_key=case when o.source_kind='practice' then o.source_token when o.stage='due' then 'reminder:'||o.source_kind||':'||o.source_id||':'||o.source_token else '' end);
 update public.nudge_occurrences o set state='suppressed' where state='pending' and not public.nudge_valid(o,stamp);
 if clock<time '09:00' or clock>=time '22:00' then return 0;end if;
 for m in select distinct member_id from public.nudge_occurrences where state='pending' and available_at<=stamp and expires_at>stamp loop
  -- Serialize quota, bundling and fan-out for one member across overlapping runs.
  perform pg_advisory_xact_lock(hashtextextended('nudge:'||m.member_id::text,0));
  if not exists(select 1 from public.push_subscriptions where member_id=m.member_id) then continue;end if;
  if exists(select 1 from public.nudge_bundles where member_id=m.member_id and day=schedule.day and window_key=floor(extract(epoch from stamp)/300)::bigint) then continue;end if;
  insert into public.nudge_quota(member_id,day) values(m.member_id,day) on conflict do nothing;
  update public.nudge_quota q set reserved=reserved+1 where q.member_id=m.member_id and q.day=schedule.day and reserved<3 returning reserved into quota;
  if not found then update public.nudge_occurrences set state='suppressed' where member_id=m.member_id and state='pending' and available_at<=stamp;continue;end if;
  insert into public.nudge_bundles(member_id,day,window_key,created_at) values(m.member_id,day,floor(extract(epoch from stamp)/300)::bigint,stamp) returning id into bid;
  update public.nudge_occurrences set state='bundled',bundle_id=bid where id in(select o.id from public.nudge_occurrences o where o.member_id=m.member_id and o.state='pending' and o.available_at<=stamp and public.nudge_valid(o,stamp) order by priority,available_at,id limit 100);
  payload:=public.nudge_payload(bid,stamp);
  if payload is null then continue;end if;
  select max(expires_at) into expiry from public.nudge_occurrences where bundle_id=bid;
  insert into public.push_jobs(subscription_id,category,event_key,source_id,source_kind,payload,expires_at,next_attempt_at)
  select s.id,'nudge','nudge:'||bid,bid,'nudge',payload,expiry,stamp from public.push_subscriptions s where member_id=m.member_id on conflict(subscription_id,event_key) do nothing;
  get diagnostics n=row_count;total:=total+n;
 end loop;
 -- No unbounded history: terminal delivery evidence is retained for 30 days.
 delete from public.nudge_occurrences where expires_at<stamp-interval '30 days';
 delete from public.push_jobs where source_kind='nudge' and source_id in(select b.id from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id));
 delete from public.nudge_bundles b where not exists(select 1 from public.nudge_occurrences o where o.bundle_id=b.id);
 delete from public.nudge_quota where day<schedule.day-30;
 return total;
end;$$;

alter function public.nudge_payload(uuid,timestamptz) rename to nudge_base_payload;
create function public.nudge_payload(p_bundle uuid,stamp timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;o public.nudge_occurrences;p public.communication_posts;e jsonb;source text;total integer;preview jsonb;
begin
 payload:=public.nudge_base_payload(p_bundle,stamp);if payload is null then return null;end if;
 select count(*) into total from public.nudge_occurrences x where bundle_id=p_bundle and public.nudge_valid(x,stamp);
 select * into o from public.nudge_occurrences x where bundle_id=p_bundle and public.nudge_valid(x,stamp) order by case when source_kind='practice' then 0 else 1 end,priority,available_at,id limit 1;
 if o.source_kind='practice' then
  select x,s.source_fingerprint into e,source from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) x where 'practice:'||(x->>'id')||':'||(x->>'start')=o.source_token and public.push_calendar_current(s.source_fingerprint);
  if e is null then return null;end if;
  preview:=public.practice_preview(e,source,o.member_id);
  if total>1 then preview:=preview||jsonb_build_object('body',left(preview->>'body',180)||' · More reminders in your Today plan.','url','/home');end if;
  return payload||preview;
 elsif total=1 and o.source_kind='announcement' then
  select * into p from public.communication_posts where id=o.source_id;
  return payload||jsonb_build_object('title',p.title,'body',left(coalesce(p.author_name,'Team member')||': '||coalesce(nullif(p.reminder_message,''),btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'))),240));
 end if;
 return payload;
end;$$;
create or replace function public.push_prepare_delivery(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs;p public.communication_posts;e jsonb;source text;member uuid;preview text;starts timestamptz;
begin
 if not public.push_can_deliver(p_id,p_token) then return null;end if;
 select * into j from public.push_jobs where id=p_id;
 select member_id into member from public.push_subscriptions where id=j.subscription_id;
 if j.source_kind='nudge' then return public.nudge_payload(j.source_id,now());end if;
 if j.source_kind='practice' then
  select x,s.source_fingerprint into e,source from public.calendar_snapshot s cross join lateral jsonb_array_elements(s.events) x where 'practice:'||(x->>'id')||':'||(x->>'start')=j.event_key and public.push_calendar_current(s.source_fingerprint);
  if e is null then return null;end if;
  return j.payload||public.practice_preview(e,source,member)||jsonb_build_object('expiresAt',j.expires_at);
 end if;
 if j.category='announcement' and j.source_kind='communication' then
  select * into p from public.communication_posts where id=j.source_id and kind='announcement';if not found then return null;end if;
  if p.practice_event_id is not null then
   e:=public.practice_event(p.practice_source,p.practice_event_id);
   -- During the scheduled practice reminder window, the shared event alert carries this message.
   if e is not null then
    starts:=(e->>'start')::timestamptz;
    if starts between now()+interval '30 minutes' and now()+interval '60 minutes' then
     -- Merge only when this device has a real pending shared delivery. A note posted
     -- after the practice reminder was sent must still get its publication alert.
     perform public.push_enqueue_reminders();
     if exists(select 1 from public.push_jobs shared where shared.subscription_id=j.subscription_id and shared.status='pending' and shared.expires_at>now() and public.push_job_valid(shared,member) and
       ((shared.source_kind='practice' and shared.event_key='practice:'||(e->>'id')||':'||(e->>'start')) or
        (shared.source_kind='nudge' and exists(select 1 from public.nudge_occurrences o where o.bundle_id=shared.source_id and o.member_id=member and o.source_kind='practice' and o.source_token='practice:'||(e->>'id')||':'||(e->>'start'))))) then return null;end if;
    end if;
   end if;
  end if;
  preview:=coalesce(p.author_name,'Team member')||': '||btrim(regexp_replace(p.body,'[[:space:]]+',' ','g'));
  return j.payload||jsonb_build_object('title',case when p.practice_event_id is not null then 'Practice: ' else '' end||p.title,'body',case when char_length(preview)>240 then left(preview,239)||'…' else preview end,'expiresAt',j.expires_at);
 end if;
 return j.payload||jsonb_build_object('expiresAt',j.expires_at);
end;$$;


revoke all on function public.exec_member(),public.set_exec_roles(uuid,text[],text[]),public.practice_identity(jsonb),public.communication_manager(uuid,text),public.communication_metadata(),public.save_announcement(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid,text,text,text),public.practice_event(text,text),public.practice_preview(jsonb,text,uuid),public.nudge_base_payload(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.exec_member(),public.communication_manager(uuid,text),public.set_exec_roles(uuid,text[],text[]),public.save_announcement(uuid,integer,text,text,text,text,text,uuid[],uuid,date,date,text,text,timestamptz,text,text,uuid,text,text,text) to authenticated;
-- Keep existing save entrypoints compatible with the production app on the shared database.
-- The insert trigger derives legacy attribution from assigned roles; callers cannot spoof it.
-- The new validated wrapper additionally supports an explicit choice among assigned roles.
commit;
