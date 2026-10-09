# Announcement images and expiration

Implementation is locally verified. Live migration, schedules, deployment and physical phone testing still require the following setup.

## Activate on the live website

1. In Supabase SQL Editor, run the complete [0010 migration](../supabase/migrations/0010_announcement_images_expiration.sql) **once, after0009 is fully applied**. It creates the private `announcement-images` bucket and expiration rules in one transaction. An error rolls back the attempt. Do not rerun earlier migrations.
2. Enable `pg_cron` in Supabase Extensions, then run [expiration schedule setup](../supabase/setup/announcement-expiration-cron.sql). This installs the five-minute database purge and daily pruning of this application's cron history. Named schedule setup can be rerun safely.
3. In Vercel Production, keep `SUPABASE_SECRET_KEY` and a private `CRON_SECRET` of at least32 characters. The service key stays server-only. Redeploy the updated application after the migration.
4. Keep the five-minute `/api/maintenance` schedule and matching Vault secret from [management setup](management.md#permanent-deletion-rollout). If missing, enable `pg_net`/Vault and install that schedule. It now purges expired items and deletes announcement images as well as formation PDFs. No notification/VAPID configuration is required for maintenance. SQL purge alone cannot delete Storage bytes.
5. Check Supabase Cron execution and the maintenance HTTP response: expect200; retry503 and investigate401 secret mismatch. SQL schedule success only means the HTTP request was queued. Check Storage usage after deleting a test image. Test posting/removing a photo on a real phone and viewing it as a second intended dancer.

## What members see

Admin announcement forms offer one optional image selected from the phone's native Photos/Files picker. JPEG, PNG and WebP are supported. HEIC/HEIF currently show guidance to choose a JPEG or PNG; tiled HEIC cannot be safely bounded before native decoding, so it is deliberately rejected rather than risking a large phone memory allocation. Some phones offer compatible JPEG conversion when selecting a photo. The original stays untouched.

The browser bounds source input to20MB and20 megapixels, resizes to1600px maximum long edge and tries progressively smaller JPEG quality/dimensions. It targets at most500KB, with a hard1MB upload limit. Transparent backgrounds become white. The server checks actual JPEG bytes, decodes/re-encodes and strips embedded metadata before storing. Preview, replace/remove, progress and errors preserve the text draft. The final stored JPEG can differ slightly in size from the prepared preview. There are no paid image transformations.

Images require active membership and access to that announcement's audience. Public links and long-lived signed links are not used. Expiration/replacement/removal immediately denies fresh image requests; already downloaded copies cannot be recalled.

Announcement, to-do and custom featured-event forms have an optional expiration date. Blank means no expiration. Items remain available through that date in **Texas time**, then disappear from lists, Home, detail/editor routes, admin, exports and queued notification delivery. Mounted pages hide content at the cutoff. Due dates and event dates stay separate. Payments and Google Calendar events keep their existing behavior.

## Permanent deletion and limits

Expired rows and related recipients, completion records, history and queued notifications are permanently removed in bounded batches. The SQL job normally runs within five minutes of cutoff while Supabase is running; it keeps working independently of Vercel file cleanup. Maintenance removes actual Storage bytes through the Storage API and retries failures. Replaced/deleted linked images also receive post-response cleanup immediately.

Abandoned uploads are quarantined for two minutes; unfinished drafts are swept after one hour. After acknowledged deletion, private object-key cleanup evidence remains for one day and reconciles hourly to catch a late provider response. It contains no announcement content or image bytes and cannot restore or reattach anything. It is removed after the reconciliation period. No archive or restore views exist.

This uses existing free-plan features and bounded five-minute Supabase jobs rather than Vercel Hobby's daily cron. It does not guarantee that an account with exhausted quotas remains free: images share storage and bandwidth with PDFs. Monitor Supabase usage; announcements with500KB images use roughly250MB for500 images. Provider outages/paused projects delay physical deletion; expiry access restrictions apply whenever the database is available. Schedule logs retain seven days.

Local verification: permission/cascade/DST/stale-editor SQL checks, real JPEG parsing and metadata removal, cleanup retry behavior, and desktop/mobile Chromium upload/display/remove/mounted-expiration tests. These do not establish live quotas, physical iPhone picker behavior or hosted schedule health.
