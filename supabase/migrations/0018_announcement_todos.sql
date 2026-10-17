-- Durable announcement/to-do links with independent read and completion progress.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0018',0));
alter table public.communication_posts add column linked_todo_id uuid unique references public.communication_posts(id) on delete set null;
alter table public.communication_posts add constraint announcement_todo_kind check(linked_todo_id is null or (kind='announcement' and linked_todo_id<>id));
create function public.communication_todo_detached() returns trigger language plpgsql set search_path='' as $$
begin
 if old.linked_todo_id is not null and new.linked_todo_id is null then new.version:=old.version+1;new.edited_at:=now();end if;
 return new;
end;$$;
create trigger communication_todo_detached before update of linked_todo_id on public.communication_posts for each row execute function public.communication_todo_detached();
create function public.save_announcement_with_todo(post_data jsonb,todo_id uuid,todo_due date,todo_mode text) returns uuid language plpgsql security definer set search_path='' as $$
declare parent public.communication_posts; members uuid[]; task_role text; saved uuid; prior_jobs uuid[];
begin
 if not public.admin_member() then raise exception 'Management access required';end if;
 if post_data->>'post_kind' is distinct from 'announcement' then raise exception 'Only announcements can create a linked to-do';end if;
 if todo_id is null or todo_id=(post_data->>'target_id')::uuid or exists(select 1 from public.communication_posts where id=todo_id) then raise exception 'Choose a new linked to-do. Refresh';end if;
 if todo_mode is null or todo_mode not in ('individual','shared') then raise exception 'Choose a valid completion mode';end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into prior_jobs from public.push_jobs where source_kind='communication' and source_id=(post_data->>'target_id')::uuid;
 if post_data->>'practice_id'='__custom__' then
  saved:=public.save_announcement_custom((post_data->>'target_id')::uuid,(post_data->>'expected_version')::integer,(post_data->>'post_kind'),(post_data->>'post_title'),(post_data->>'post_body'),(post_data->>'task_mode'),(post_data->>'audience'),array(select jsonb_array_elements_text(coalesce(post_data->'recipient_ids','[]'::jsonb))::uuid),(post_data->>'source_id')::uuid,(post_data->>'due_date')::date,(post_data->>'expiration_date')::date,(post_data->>'image_object'),(post_data->>'image_alt'),(post_data->>'reminder_time')::timestamptz,(post_data->>'reminder_type'),(post_data->>'reminder_text'),(post_data->>'linked_task')::uuid,(post_data->>'posting_role'),(post_data->>'practice_id'),(post_data->>'calendar_source'),(post_data->>'custom_id')::uuid,(post_data->>'custom_version')::integer,(post_data->>'custom_title'),(post_data->>'custom_start')::timestamptz,(post_data->>'custom_end')::timestamptz,(post_data->>'custom_location'));
 else
  saved:=public.save_announcement((post_data->>'target_id')::uuid,(post_data->>'expected_version')::integer,(post_data->>'post_kind'),(post_data->>'post_title'),(post_data->>'post_body'),(post_data->>'task_mode'),(post_data->>'audience'),array(select jsonb_array_elements_text(coalesce(post_data->'recipient_ids','[]'::jsonb))::uuid),(post_data->>'source_id')::uuid,(post_data->>'due_date')::date,(post_data->>'expiration_date')::date,(post_data->>'image_object'),(post_data->>'image_alt'),(post_data->>'reminder_time')::timestamptz,(post_data->>'reminder_type'),(post_data->>'reminder_text'),(post_data->>'linked_task')::uuid,(post_data->>'posting_role'),(post_data->>'practice_id'),(post_data->>'calendar_source'));
 end if;
 select * into parent from public.communication_posts where id=saved for update;
 if parent.linked_todo_id is not null then raise exception 'Announcement already has a linked to-do. Refresh';end if;
 select array_agg(member_id order by member_id) into members from public.communication_recipients where post_id=saved;
 select case when parent.created_by=auth.uid() and parent.author_exec_role=any(exec_roles) then parent.author_exec_role else exec_roles[1] end into task_role from public.members where id=auth.uid();
 perform public.save_announcement(todo_id,0,'task',parent.title,parent.body,todo_mode,'selected',members,null,todo_due,null,null,'',null,null,'',null,task_role,null,null);
 update public.communication_posts set linked_todo_id=todo_id where id=saved;
 insert into public.communication_audit(post_id,actor_id,action,details) values(saved,auth.uid(),'todo_link_saved',jsonb_build_object('todo_id',todo_id));
 -- One initial publication alert opens the announcement and its new task link.
 delete from public.push_jobs child where child.source_kind='communication' and child.source_id=todo_id and exists(select 1 from public.push_jobs parent_job where parent_job.subscription_id=child.subscription_id and parent_job.source_kind='communication' and parent_job.source_id=saved and parent_job.status='pending' and not(parent_job.id=any(prior_jobs)));
 return saved;
end;$$;
revoke all on function public.communication_todo_detached(),public.save_announcement_with_todo(jsonb,uuid,date,text) from public,anon,authenticated,service_role;
grant execute on function public.save_announcement_with_todo(jsonb,uuid,date,text) to authenticated;
commit;
