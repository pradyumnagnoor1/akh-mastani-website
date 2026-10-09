-- Hosted Storage/CDN checks authenticated object metadata before returning bytes.
-- Preserve existing member/audience/deletion/expiry restrictions; allow no signing/listing.
begin;
set local lock_timeout='10s';
select pg_advisory_xact_lock(hashtextextended('mastani-migration-0011',0));
do $$begin
 if to_regclass('public.formation_cleanup') is null or to_regclass('public.announcement_uploads') is null then
  raise exception 'Apply complete migrations0009 and0010 before0011';
 end if;
end;$$;
drop policy if exists formations_read on storage.objects;
create policy formations_read on storage.objects for select to authenticated using(
 bucket_id='formations' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and public.active_member() and
 (exists(select 1 from public.segments s where s.document_path=storage.objects.name and s.archived_at is null)
 or (public.admin_member() and exists(select 1 from public.segment_audit a join public.segments s on s.id=a.segment_id where s.archived_at is null and (a.details->>'document_path'=storage.objects.name or a.details->>'previous_document_path'=storage.objects.name))))
);
drop policy if exists announcement_image_read on storage.objects;
create policy announcement_image_read on storage.objects for select to authenticated using(
 bucket_id='announcement-images' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
 and exists(select 1 from public.communication_posts p where p.image_path=storage.objects.name and public.communication_access(p.id))
);
commit;
