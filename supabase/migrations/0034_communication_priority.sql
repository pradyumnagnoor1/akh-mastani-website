begin;
alter table public.communication_posts add column pinned_at timestamptz;
alter table public.communication_posts add column priority text not null default 'normal' check(priority in ('low','normal','high','urgent'));
create function public.set_communication_metadata(target_id uuid,expected_version integer,pin boolean,task_priority text) returns void language plpgsql security definer set search_path='' as $$
declare p public.communication_posts;
begin
 select * into p from public.communication_posts where id=target_id for update;
 if p.id is null or not public.communication_manager(target_id,p.kind) then raise exception 'Communication management access required';end if;
 if expected_version is null or p.version<>expected_version or p.archived_at is not null or (p.expires_at is not null and p.expires_at<=now()) then raise exception 'Communication changed. Refresh';end if;
 if task_priority is null or task_priority not in ('low','normal','high','urgent') or (p.kind<>'task' and task_priority<>'normal') then raise exception 'Choose a valid task priority';end if;
 update public.communication_posts set pinned_at=case when pin then coalesce(p.pinned_at,now()) else null end,priority=task_priority,version=version+1 where id=target_id;
 insert into public.communication_audit(post_id,actor_id,action,details) values(target_id,auth.uid(),'metadata_updated',jsonb_build_object('pinned',pin,'priority',task_priority,'version',expected_version+1));
end;$$;
revoke all on function public.set_communication_metadata(uuid,integer,boolean,text) from public,anon;
grant execute on function public.set_communication_metadata(uuid,integer,boolean,text) to authenticated;
create function public.save_communication_v21(post_data jsonb,task_priority text default 'normal',todo_id uuid default null,todo_due date default null,todo_mode text default 'individual',todo_priority text default 'normal') returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if task_priority is null or task_priority not in ('low','normal','high','urgent') or todo_priority is null or todo_priority not in ('low','normal','high','urgent') then raise exception 'Choose a valid task priority';end if;
 if todo_id is not null then
 saved:=public.save_announcement_with_todo(post_data,todo_id,todo_due,todo_mode);
 elsif post_data->>'practice_id'='__custom__' then
  saved:=public.save_announcement_custom((post_data->>'target_id')::uuid,(post_data->>'expected_version')::integer,(post_data->>'post_kind'),(post_data->>'post_title'),(post_data->>'post_body'),(post_data->>'task_mode'),(post_data->>'audience'),array(select jsonb_array_elements_text(coalesce(post_data->'recipient_ids','[]'::jsonb))::uuid),(post_data->>'source_id')::uuid,(post_data->>'due_date')::date,(post_data->>'expiration_date')::date,(post_data->>'image_object'),(post_data->>'image_alt'),(post_data->>'reminder_time')::timestamptz,(post_data->>'reminder_type'),(post_data->>'reminder_text'),(post_data->>'linked_task')::uuid,(post_data->>'posting_role'),(post_data->>'practice_id'),(post_data->>'calendar_source'),(post_data->>'custom_id')::uuid,(post_data->>'custom_version')::integer,(post_data->>'custom_title'),(post_data->>'custom_start')::timestamptz,(post_data->>'custom_end')::timestamptz,(post_data->>'custom_location'));
 else
  saved:=public.save_announcement((post_data->>'target_id')::uuid,(post_data->>'expected_version')::integer,(post_data->>'post_kind'),(post_data->>'post_title'),(post_data->>'post_body'),(post_data->>'task_mode'),(post_data->>'audience'),array(select jsonb_array_elements_text(coalesce(post_data->'recipient_ids','[]'::jsonb))::uuid),(post_data->>'source_id')::uuid,(post_data->>'due_date')::date,(post_data->>'expiration_date')::date,(post_data->>'image_object'),(post_data->>'image_alt'),(post_data->>'reminder_time')::timestamptz,(post_data->>'reminder_type'),(post_data->>'reminder_text'),(post_data->>'linked_task')::uuid,(post_data->>'posting_role'),(post_data->>'practice_id'),(post_data->>'calendar_source'));
 end if;
 update public.communication_posts set priority=case when kind='task' then task_priority else 'normal' end where id=saved;
 if todo_id is not null then update public.communication_posts set priority=todo_priority where id=todo_id;end if;
 return saved;
end;$$;
revoke all on function public.save_communication_v21(jsonb,text,uuid,date,text,text) from public,anon;
grant execute on function public.save_communication_v21(jsonb,text,uuid,date,text,text) to authenticated;
commit;
