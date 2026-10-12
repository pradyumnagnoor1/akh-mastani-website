-- Announcement previews are explicitly requested by the owner.
-- Rebuild only eligible announcement change alerts; smart bundles stay generic.
begin;
create or replace function public.push_prepare_delivery(p_id uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.push_jobs; announcement_title text; preview text;
begin
 if not public.push_can_deliver(p_id,p_token) then return null;end if;
 select * into j from public.push_jobs where id=p_id;
 if j.source_kind='nudge' then return public.nudge_payload(j.source_id,now());end if;
 if j.category='announcement' and j.source_kind='communication' then
  select title, btrim(regexp_replace(body,'[[:space:]]+',' ','g'))
  into announcement_title,preview from public.communication_posts
  where id=j.source_id and kind='announcement';
  if not found then return null;end if;
  if char_length(preview)>240 then preview:=left(preview,239)||'…';end if;
  return j.payload||jsonb_build_object('title',announcement_title,'body',coalesce(nullif(preview,''),'Open the announcement to view its contents.'),'expiresAt',j.expires_at);
 end if;
 return j.payload||jsonb_build_object('expiresAt',j.expires_at);
end;$$;
revoke all on function public.push_prepare_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_prepare_delivery(uuid,uuid) to service_role;
commit;
