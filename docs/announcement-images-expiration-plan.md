# Plan: optional announcement images and automatic expiration

Status: approved and implemented locally; see [rollout and verified behavior](announcement-images-expiration.md). Hosted activation remains pending.

## Product behavior

- Preserve existing posting permissions: the current admin announcement editor gains one optional image. This does not grant dancers announcement-publishing permissions.
- Use the native phone image picker, allowing Photos or Files where supported, without forcing camera capture. Preview, remove and replace before saving; show preparation/upload/error states and preserve text drafts.
- Convert supported images to JPEG before uploading. Resize initially to at most1600px on the long side, preserve orientation, flatten transparency on white and discard embedded metadata. Reduce JPEG quality/dimensions within readability thresholds to target300–500KB; enforce1MB output maximum rather than promise the mathematically smallest image. Avoid increasing an already efficient image unnecessarily. Original phone file remains untouched.
- Bound source bytes/pixel dimensions and memory. Test iPhone photo/HEIC selections and Files; do not assume all browsers decode HEIC. Use native compatible conversion when available; any required HEIC decoder must be isolated/lazy-loaded and evaluated for mobile memory and licensing. Unsupported/corrupt files receive actionable guidance, never a silently corrupted upload.
- Initially attachments are for announcements only, not to-dos or featured events. Lazy-load images in announcement/detail/Home contexts, with an accessible enlarge view and optional image description.
- Add an optional expiration date to announcement, to-do and custom featured-event create/edit forms. Blank means no automatic expiration. Existing items retain no-expiration behavior. Preserve existing due dates/event dates separately.
- Date means the item remains available through that date in America/Chicago, expiring at the next local midnight. Convert to UTC timestamps correctly across DST. Clearly state permanent deletion in the editor. No auto-expiration of Google Calendar source events or privately retained payments.

## Database and private storage

- Add a new ordered migration after0009. Verify live prerequisite state before rollout; do not replay0008 over0009.
- Add nullable expires_at to communication_posts and featured_events, indexed for expiration scans. Extend types, validation and version-checked create/edit RPCs without breaking unrelated transitions.
- Introduce private announcement-image attachment/upload records and a JPEG-only Storage bucket with1MB object limit. Validate actual decoded image/size server-side; do not rely on file extension or browser checks. Unique immutable object paths, no in-place overwrites.
- Restrict image upload/edit to existing authorized announcement authors/admins. Image reads require active membership and visibility of the linked non-expired announcement, including selected-audience restrictions; no public bucket. Deliver through authenticated, no-store read paths rather than long-lived shareable URLs.
- Reserve upload state before transfer. Save attachment linkage atomically with the announcement update. Failed/cancelled uploads, abandoned drafts, replacement and deletion enqueue cleanup. Race fences prevent attachment reuse after cleanup is queued.
- Extend existing durable formation cleanup approach to image objects. Remove actual objects through the Storage API, not SQL deletes of storage.objects. Retry provider failures; delete temporary cleanup state after success.

## Expiration consistency and scheduling

- Enforce expiry in database visibility policies and app queries, not just a cron job. Apply to Home, lists, details, admin, exports, image access and notification job generation/dispatch.
- Mounted pages also remove expired visible items at the cutoff using server-provided time/timestamps; refresh/reconnect must not restore them. Already-downloaded copies cannot be recalled.
- Privileged, bounded, retry-safe database purge deletes expired communication/custom featured-event rows and cascades recipient/completion/history records, pending notification jobs and attachment links. Reuse0009 deletion triggers; do not invent an archive or restore view.
- Schedule the SQL purge with Supabase Cron every five minutes. Database deletion normally follows the cutoff within five minutes while the project/scheduler is running. No claim of exact-time execution during pauses/outages.
- Extend existing authenticated /api/maintenance and five-minute Supabase Cron/Vault schedule for actual file removal/retries, independent of notification/VAPID setup. No frequent Vercel Hobby cron required.
- Record failures and retry; cap batches, deduplicate schedules, index scans and prune old cron run logs to avoid unbounded use of the500MB free database allowance.

## Free-plan design and practical limits

- Browser-side resizing/compression; no paid Supabase image transformations.
- One image per announcement, target300–500KB and hard1MB; only the final JPEG is stored. PDFs share the existing1GB file allowance.500 images at500KB use approximately250MB before PDFs and other storage.
- Lazy loading and no duplicate full-resolution originals/thumbnails. Private no-store delivery favors immediate access revocation; recurring image loads still consume uncached bandwidth, so monitor monthly usage.
- Current Free allowances:1GB files,500MB database,5GB uncached plus separate5GB cached monthly egress. Existing usage is unknown; no unlimited-capacity or guaranteed free uptime promise. Surface upload-quota failures without losing announcement text.
- Supabase Cron handles database purge; existing server cleanup fits bounded Vercel functions. Owner must enable/configure Cron/Vault/maintenance if not already active. Verify service credentials and schedule health without exposing secrets.

## Implementation sequence and verification

1. Migration, private bucket/policies, expiry and attachment state rules; SQL permission/cascade/concurrency tests.
2. Mobile image picker/compression/preview, authenticated upload/save/read/replace/remove and orphan cleanup.
3. Expiration fields, Chicago conversion, visibility across all pages/exports/notifications and mounted expiry behavior.
4. Bounded SQL purge, Storage cleanup extension and five-minute schedule/setup instructions.
5. Full typecheck/lint/unit/SQL/build/format checks; fresh-context independent Genesis review; desktop/mobile browser acceptance and physical iPhone verification.

Acceptance: post with/without image; Photos/Files and supported HEIC conversion; rotated/transparent/large/corrupt images; readable flyers; unauthorized/other-audience/expired image denial; interrupted upload/replacement/deletion cleanup; expiration boundary and DST; version race with edit; due date distinct from expiry; cascade history/jobs; failed cleanup and cron retries; no archived views; unrelated payments/Google Calendar unaffected. Hosted quota/provider behavior and physical iPhone cannot be claimed from mocks.

## Rollout

Apply new migration after confirmed0009, deploy code, configure/verify the Supabase expiry and existing maintenance schedules, then test one short-lived item of each supported kind and one phone image with a second authorized dancer. No plan upgrade expected at the intended35-dancer usage, subject to actual remaining quota. Apply the rollout instructions above to activate the locally implemented feature.

Sources checked2026-10-09: [Supabase pricing](https://supabase.com/pricing), [Supabase Cron](https://supabase.com/docs/guides/cron), [Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
