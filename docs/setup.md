# Supabase and Google setup

No Supabase project has been created or live integration validated as part of the local milestones. These are operator setup instructions.

## 1. Create the project

Create a Supabase project in an organization you control. Save its database password in your password manager. Use a US region suitable for the team and your Vercel deployment. Keep production and development data separate.

In the project's Connect dialog, copy the project URL and **publishable** key into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
APP_ORIGIN=http://localhost:3000
```

Never put a service-role or secret key in a `NEXT_PUBLIC_` variable. Member-facing features use the publishable key and member session. The optional calendar adapter alone requires server-only `SUPABASE_SECRET_KEY`; that key is privileged across the entire project. `.env.local` is ignored by Git. Set environment-specific values in Vercel with the real HTTPS origin; see [deployment](deployment.md) and [calendar connection](calendar-setup.md).

## 2. Apply the migrations

In Supabase SQL Editor, run the complete contents of `supabase/migrations/0001_identity.sql` once. Keep migration history consistent; do not rerun a migration that has already succeeded. Then run `supabase/migrations/0002_segments.sql` and `supabase/migrations/0003_communication.sql`, then `supabase/migrations/0004_payments.sql` and `supabase/migrations/0005_calendar.sql`, followed by `supabase/migrations/0006_calendar_connection.sql`, once each in that order. For later milestones, apply new migrations in order.

This creates member records, RLS policies, controlled onboarding/approval functions and an audit table. Only verified Google accounts with exact `@tamu.edu` emails can create member profiles or access member data. Ineligible authentication identities may exist in Supabase Auth but cannot create a team profile or read team records. Auth signup rejection hooks can additionally reject account creation; they are not the sole protection for data access.

## 3. Configure Google sign-in

In Google Cloud, create/configure an OAuth consent screen and a Web application OAuth client. Use only basic identity scopes (openid, email, profile). For a student-controlled project outside the TAMU Google organization, do not assume the “Internal” audience is available. Use the appropriate audience and add your TAMU account as a test user while testing.

In Supabase Authentication → Sign In / Providers, enable Google, enter the Google OAuth client ID and client secret there, and copy Supabase's callback URL into the Google client's authorized redirect URIs. Disable password, anonymous, phone and other sign-in providers for this application. Do not enable manual identity linking for this Google-only setup.

In Supabase URL Configuration set the site URL to `http://localhost:3000` for development and allow `http://localhost:3000/auth/callback`. For production, set the production HTTPS URL and add its exact callback. Keep `APP_ORIGIN` aligned with the browser's origin; do not mix localhost and 127.0.0.1. Use a stable staging URL for Google testing instead of broadly allowing preview domains.

The `hd=tamu.edu` Google account-picker hint is not an access control. Server identity checks and database policies enforce verified exact email domain, trusted Google provider, and current membership. This gates team access; it does not claim official university enrollment verification. Actual TAMU account consent must be tested because university policy can restrict third-party applications.

## 4. Create your initial admin profile

1. Start the website and sign in with **pradyumnagnoor@tamu.edu** through Google.
2. Enter your roster name. You will reach the awaiting-approval screen.
3. In Supabase SQL Editor run `scripts/grant-initial-admin.sql`.
4. Click “Check my access.” Your Home page and Admin navigation will now be available.

The script refuses to grant access until the matching verified Google identity and completed name exist. It never selects whoever signs in first. Other approved members remain dancers without admin rights.

## 5. Approve teammates and future admins

Teammates sign in and enter their names. Review their requests on Admin and approve access. Admin membership controls cannot grant administrator privileges.

To authorize an additional admin yourself, identify their verified, approved member UUID in Supabase. Run a manual database-owner update for that exact UUID, after checking their email:

```sql
update public.members m
set is_admin = true
from auth.users u
where m.id = u.id
  and m.id = 'REPLACE_WITH_VERIFIED_MEMBER_UUID'::uuid
  and m.email = 'REPLACE_WITH_EXPECTED_EMAIL@tamu.edu'
  and lower(u.email) = m.email
  and u.email_confirmed_at is not null
  and u.raw_app_meta_data->>'provider' = 'google'
  and m.status = 'active'
  and m.display_name is not null;
```

Check exactly one row changed. To remove management rights, use the verified UUID to set `is_admin=false`; their profile, assignments and dancer membership remain. Keep at least one recoverable owner/admin account and protect database console access.

Preapproval before first sign-in is not implemented in M1. Approve the verified profile after onboarding. Never match a profile using its display name alone.

## 6. Required live checks before release (M7)

- Your TAMU login succeeds; personal Gmail cannot enter the team hub.
- A second TAMU account reaches name setup once, then remains pending until approved.
- After approval, that dancer can read the active roster but cannot open Admin or directly update status/role through Supabase.
- Your admin account retains its personal dancer experience.
- Deactivating a member removes access in their already-open session on the next request.
- Sign-out, expired-session refresh, cancelled Google consent and subsequent login behave correctly.
- Production callback URLs and private/no-store responses work on the actual Vercel domain.
- Run the PDF and payment acceptance checks below and the [calendar live checks](calendar-setup.md).

Do not mark live sign-in verified based only on local tests. Audit history is append-only for application roles; trusted database operators can modify it. The admin operational JSON export includes payment audit history but is neither tamper-proof nor a full backup; see [operations](operations.md).

## Maintenance and handover

Retain the lockfile and versioned migrations. Review dependency updates monthly; run checks before deployment. Keep ownership/billing recovery access documented for a second trusted maintainer. Configure database backups and separately back up formation PDF bytes. Complete the [backup and restore drill](operations.md) before launch. Archive seasons rather than deleting member and payment history. Monitor failed sign-ins, database errors and calendar freshness without logging tokens or private records.

Sources: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/auth/server-side/creating-a-client

## Set Design and formation PDFs (M2)

Migration 0002 creates segments, dancer assignments, audit history and the private `formations` bucket. It requires Supabase's `storage.allow_only_operation(text)` helper. If the function is unavailable, stop setup and update/check your Storage service; do not remove the operation restriction. It prevents members (including admins) from minting signed download URLs that would outlive their access. Only authenticated downloads are permitted. See [Storage operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions).

Admins create a segment with its name, a PDF up to 4 MiB, and selected active dancers. Admins appear in that same dancer picker. Saving updates Home and Roster through shared assignments. Concurrent stale edits are rejected and require a refresh. Removing a segment archives it; dancers no longer see it while admins retain the record. Replacements upload a new immutable object; previous PDFs remain private for history.

PDF requests use the member session and check current access through database and Storage policies. No public bucket or signed URL is used. Uploaded files are checked for size, extension, MIME and PDF header, not fully scanned for malicious content. Use trusted team formation documents. PDF open/download controls are provided for browsers without inline viewing.

Before release, use real admin and dancer accounts to create/edit/archive a segment, replace a PDF, and confirm assignments on Home/Roster. Verify both single and batch `createSignedUrl` requests fail for both accounts. Verify ordinary authenticated download succeeds while active and fails after deactivation, including in an already-open browser. Check that the dancer cannot fetch a replaced or archived PDF. Test inline viewing and download on desktop and a real phone. The local fixture models the documented operation helper; it cannot verify your deployed Storage service sets operation context correctly.

Failed or uncertain saves may leave an unreferenced PDF. Do not delete files immediately after an uncertain result: the transaction may have committed. During maintenance, compare Storage keys with both current segment paths and audit history, keep a grace period, and investigate before removing any genuinely unused upload. Storage backups are separate from database backups; preserve both. Routine automatic garbage collection is not implemented.

## Announcements and to-dos (M3)

Migration 0003 adds targeted posts, immutable recipient snapshots, saved dancer groups and completion audit history. Admins publish to one dancer, selected dancers, a saved group, a segment lineup or the current active team. Admins are selectable as dancers. Group/segment/team membership is resolved when the item is published; subsequent membership edits do not add or remove existing recipients. Inactive dancers still lose access immediately on their next request.

Announcements have per-person read acknowledgment. To-dos have either per-person completion or one shared completion that records the first completing dancer. Only recipients may complete; an unassigned admin manages the item but does not complete it as a dancer. Admins edit text/due dates, reopen individual or shared completion, and archive/restore items. Original recipients and completion mode stay fixed; create a new item to assign different people. Archives retain progress and remain admin-only. Stale edits/reopens fail and require a refresh. Repeated completion requests do not duplicate history.

Saved groups are admin-managed and can be archived without changing previously published items. Editing a group removes deactivated members from future selections. Communication queries read through API page limits so large recipient histories do not silently disappear; keep Supabase's API maximum rows at least 500 (the page size).

Before release, repeat the local flows with real Google accounts: publish to one dancer and prove another cannot read it through direct Supabase requests; complete an individual item and show others remain unfinished; complete shared work and check the actor; reopen then reject an old completion form; archive/restore and check visibility. Confirm audience snapshots survive team/group/segment changes and deactivation removes access in an existing session. The local tests use synthetic authentication and do not satisfy these hosted checks.

## Payments (M4)

Apply migration 0004 after the communication migration. Admins issue USD charges to one dancer, selected dancers, a group, a segment, or the current team. Amounts use integer cents and each charge is limited to $10,000. Recipients are saved at issue time; group changes do not move an existing balance. Review the per-person and total amount before issuing. If a charge is wrong, waive it with an explanation and issue a corrected charge; payment amounts are not silently edited.

Members report their own payment with an optional reference. Reported charges remain outstanding until an admin verifies the transfer using the team's actual payment records. Rejecting a report requires a reason and returns the charge to unpaid so the dancer can report again. A waiver also requires a reason. Verified/waived records leave outstanding views but remain in History and the append-only application audit. No money moves through this website; instructions describe the team's separately agreed payment method.

Payment details and audit history are private to the assigned dancer and active admins. Admins retain their own dancer charges. Batch IDs and version checks prevent duplicate charges or transitions from repeated submissions; after a network error, refresh and inspect the existing records before retrying. Deactivation blocks access but preserves the charge history.

Required live checks: charge two different dancers, prove each cannot fetch the other's charges/audit directly, report/reject/re-report/verify, confirm pending reports remain outstanding, test waiver reason and stale/double-click rejection, and deactivate an already-signed-in dancer. Confirm these against hosted Supabase before release.

## Home Screen notifications

After the core setup, apply migration0007 and follow [notifications setup](notifications.md) for the VAPID keys, private scheduler secret and five-minute reminder job. Google Calendar scopes do not change.

## Admin management and featured events

Apply `supabase/migrations/0008_management_featured_events.sql` once after0007 before deploying this version. Follow [management setup and checks](management.md). No additional credentials or scheduledjobs are required.
