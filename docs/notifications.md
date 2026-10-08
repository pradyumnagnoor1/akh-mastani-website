# Home Screen app and notifications

The app is installable with the supplied Mastani logo. Approved dancers opt in on each device from Home → Notifications. On iPhone, open the site in Safari, use Share → Add to Home Screen with **Open as Web App** enabled if shown, open that icon, sign in, then tap **Enable notifications**. iOS 16.4+ is required for Web Push. Allow notifications and Lock Screen alerts in device settings. No Apple Developer account or App Store submission is needed.

## What sends a notification

| Event                                                 | Recipients                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| New or edited announcement                            | Its captured audience                                                           |
| New, edited or reopened to-do                         | Assigned dancers who still need to complete it                                  |
| New payment charge, verification, rejection or waiver | The dancer who owns the payment                                                 |
| Segment assignment or formation PDF change            | Current assigned dancers                                                        |
| To-do/payment due today                               | Incomplete/unpaid assignees; once per device per day, from 9 AM Central         |
| Upcoming timed calendar event                         | Active dancers, once per event/start per device, 30–60 minutes before it starts |

All-day calendar events do not send practice reminders. Since the calendar is a team practice calendar, every timed event is treated as a practice. The reminder uses a fresh snapshot of the connected calendar; snapshots older than15 minutes, disconnected calendars, and removed events are suppressed. After a refresh failure, the last successful snapshot remains eligible only within that15-minute freshness grace. Google edits are checked every five minutes when the scheduler runs; a change after the last successful refresh can still race with delivery.

After migration0008, announcement notifications show the **announcement title** with a generic body. Other updates say **AKH Mastani**. Names, announcement bodies, task details, fines, amounts and payment reasons remain off the Lock Screen. Featured-event creation and changes send generic calendar updates. Tapping opens the relevant protected item. Completed task updates, acknowledgment/completion activity, no-op saves and self-reported payments do not generate alerts. Initial membership approval cannot push because pending members cannot subscribe yet; they check their access by signing in.

## Activate in production

1. Apply `supabase/migrations/0007_push_notifications.sql` after migrations0001–0006 in your Supabase SQL Editor. This adds device subscriptions, private notification jobs, RPCs and triggers. It does not change existing payment/task state rules. Apply the migration before deploying the new frontend.
2. Run `npm run push:setup` locally. It writes credentials to ignored `.env.local`, preserves existing VAPID keys and prints no secrets. This has already been run for the current workspace. Copy these four values from that private file into Vercel → Project Settings → Environment Variables for **Production**:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (contact address)
   - `CRON_SECRET`

   Existing `APP_ORIGIN=https://akh-mastani.vercel.app`, Supabase URL/publishable key, and server-only `SUPABASE_SECRET_KEY` remain required. Retain the VAPID key pair across deploys and handovers. Only the VAPID **public** key is exposed to browsers.

3. Deploy/redeploy the app. Enable **Fluid compute** in Vercel if it was disabled: the dispatch endpoint has a bounded120-second maximum to allow calendar refresh plus delivery. Post-mutation background dispatch runs within60 seconds. [Vercel duration limits](https://vercel.com/docs/functions/configuring-functions/duration).
4. Configure the five-minute scheduler described below. New announcements/tasks/payment/segment changes attempt delivery after the saved response. The scheduler drains any remaining jobs, retries temporary failures, refreshes Google Calendar and creates timed reminders even when nobody is using the app.
5. On one real iPhone, install the app, enable notifications, lock the phone and create an announcement addressed **only to that test dancer**. Check delivery and the tap destination. Repeat for an assigned task and a payment review. Do not send a team-wide test blast.

## Five-minute scheduler using Supabase

Use the existing Supabase project; no Vercel Pro cron upgrade is required. Vercel Hobby's built-in cron frequency is insufficient for practice reminders. Supabase Cron and `pg_net` can call the Vercel endpoint. [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Enable `pg_cron`, `pg_net` and Vault in your Supabase project. In Vault, create a secret named **mastani_push_cron_secret** containing the exact `CRON_SECRET` from Vercel. This is the narrow dispatch secret; do **not** use the Supabase secret key or VAPID private key as the HTTP authorization token.

Then run this SQL as the project owner in SQL Editor. `cron.schedule` updates the job of the same name when rerun:

```sql
select cron.schedule(
  'mastani-push-five-minutes',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://akh-mastani.vercel.app/api/notifications/dispatch',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret
                   from vault.decrypted_secrets
                   where name = 'mastani_push_cron_secret'
                   limit 1)
    ),
    timeout_milliseconds := 120000
  );
  $$
);
```

The job contains a Vault reference rather than a literal secret. However, `pg_net` temporarily stores the resolved authorization header in its internal HTTP queue. Supabase documents that database roles can read queued headers; Vault does not hide that transient copy. Dancers must never receive database connection credentials or access to the `net`/`vault` schemas through PostgREST. This dispatcher secret permits bounded processing of existing jobs only; it cannot create messages or expose subscription keys. An external HTTPS scheduler supporting a private Authorization header is an alternative if the database-role visibility is unsuitable. [Supabase queue credential behavior](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357).

An external scheduler should call the same URL with `Authorization: Bearer <CRON_SECRET>` every five minutes; never put the secret in the URL. Disable any equivalent duplicate schedules.

## Check and maintain

- Home shows notifications unconfigured until the server keys are present. Devices are registered only for active verified TAMU members and only after an explicit Enable action. Permission alone is not evidence of an active registration.
- A dancer can use up to five devices. Disable an old device to make space. Subscription keys/URLs are inaccessible through normal member/admin table reads.
- Disable stops server delivery before attempting browser unsubscribe. If browser cleanup fails, refresh does not silently re-enable delivery. Sign-out removes the device identified by that browser's HttpOnly registration cookie. Deactivation removes all that member's registrations. Re-enabling requires explicit consent; account switches do not silently transfer subscriptions.
- Worker batches claim at most20 jobs, use10 concurrent deliveries and five-second outbound timeouts. Jobs have fenced60-second leases, at mostfive attempts, exponential retry delay and expiry. Expired provider endpoints are removed. Stable notification tags reduce duplicate visible alerts after ambiguous delivery, but end-to-end exactly-once delivery is not guaranteed.
- Most update jobs expire after24 hours; provider TTL is one hour. Practice jobs expire when the event starts; due reminders expire at the end of the Central day. Old terminal job rows are pruned after30 days.
- Vercel logs contain aggregate `push_delivery` counts or generic failure codes, never endpoint/key/payload details. Scheduler responses contain counts only and return401 for an invalid secret or503 for incomplete setup/processing failure.
- In Supabase Cron, check job runs and HTTP responses. Cron SQL success means the request was queued, not that Vercel returned200. Inspect `net._http_response` status codes without displaying authorization headers. Repeated401 means secret mismatch;503 means configuration or service failure;504 means execution timeout/Fluid compute setup.
- Validate task completion before dispatch, removed/cancelled practices, rejected/verified payments and deactivated dancers in real hosted acceptance. Apple Focus and device notification settings can silence or delay alerts. Notifications are reminders; the website remains the authoritative record.
- If VAPID keys are rotated, existing browser subscriptions must be disabled/recreated with the new key. Maintain the pair in the owner password manager. Rotate `CRON_SECRET` in both Vercel and Vault together. Disable the cron job with `select cron.unschedule('mastani-push-five-minutes');` during rollback.
- To pause sending quickly, remove `VAPID_PRIVATE_KEY` from Vercel and redeploy, and disable the scheduler. Existing business mutations still work and queued updates eventually expire. To remove notification support entirely, drop notification triggers before dropping its functions/tables; do not alter payment/communication audit history.

## Verification limits

Local SQL tests verify real migrations with synthetic identities; browser tests verify manifest/icons/service-worker installation, offline privacy and permission states. Worker tests simulate transport responses without contacting Apple/Google push services. These checks do not establish real iPhone Lock Screen delivery, deployed migration/environment configuration or a working hosted scheduler. Complete the physical-device steps above after production setup.
