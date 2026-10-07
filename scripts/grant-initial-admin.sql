-- Run manually in Supabase SQL Editor AFTER Google sign-in and name onboarding.
-- No secret/service-role key is needed in the application.
-- A database operator must execute this; ordinary app sessions cannot.
do $$
declare changed integer;
begin
 update public.members m set status='active',is_admin=true
 from auth.users u
 where m.id=u.id and m.email='pradyumnagnoor@tamu.edu'
 and lower(u.email)=m.email and u.email_confirmed_at is not null
 and u.raw_app_meta_data->>'provider'='google'
 and m.display_name is not null;
 get diagnostics changed = row_count;
 if changed <> 1 then
  raise exception 'Expected one verified Google profile with completed name onboarding for pradyumnagnoor@tamu.edu; sign in and complete onboarding first.';
 end if;
end $$;
