# Vercel deployment

This is a release runbook, not evidence of a deployment. No Supabase project has been created for these local milestones. Record the actual project IDs, domain, owners, deployed commit, migration versions, and live acceptance results in the private handover record when provisioning occurs.

## Provision and configure

1. Create team-controlled Supabase and Vercel projects, with owner recovery and billing access documented. Choose compatible US regions. Use a separate Supabase project and test calendar for staging; never inject production credentials into arbitrary preview deployments.
2. Follow [setup](setup.md): configure Google-only sign-in, exact callback allowlists, the private `formations` bucket, and migrations `0001_identity.sql` through `0006_calendar_connection.sql` in numeric order. Record each successful migration; do not rerun already-applied SQL. Keep Supabase API maximum rows at least 500. Validate Storage operation helpers rather than weakening their policies.
3. Import this repository into Vercel using the Next.js preset, repository root, `npm ci`, and `npm run build`. Keep the lockfile. Select a supported Node.js version compatible with the installed Next.js package and use that same version in local/CI checks. Do not configure static export: authentication, PDF access, calendar sync, and export require server execution.
4. Set the variables below for the appropriate environment. Choose a stable HTTPS production origin, set Supabase's Site URL and exact `/auth/callback` allowlist, and align `APP_ORIGIN`. The Google sign-in client's redirect goes to Supabase's callback, as described in setup. Redeploy after environment changes.
5. Sign in as **pradyumnagnoor@tamu.edu**, complete the name step, and run `scripts/grant-initial-admin.sql` only after verifying that identity. All other dancers require manual approval; admin grants remain owner-controlled.

| Variable                               | Exposure and purpose                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public project root URL                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable/anon key; never a secret key                   |
| `APP_ORIGIN`                           | Exact canonical site origin                                       |
| `SUPABASE_SECRET_KEY`                  | Server only; calendar adapter uses this privileged project key    |
| `GOOGLE_CALENDAR_ID`                   | Optional server-side calendar form prefill                        |
| `GOOGLE_CALENDAR_CLIENT_ID`            | Server only; calendar OAuth client                                |
| `GOOGLE_CALENDAR_CLIENT_SECRET`        | Server only; calendar OAuth secret                                |
| `CALENDAR_TOKEN_ENCRYPTION_KEY`        | Server only; 32-byte base64 key encrypting stored calendar tokens |

The calendar variables and Supabase secret are needed only for the optional private calendar connection. Follow [calendar setup](calendar-setup.md) for scope, durable authorization, and ownership. No runtime secret belongs in Git, screenshots, build output, or browser variables. Google sign-in provider credentials live in Supabase Auth configuration, separately from the calendar adapter credentials.

## Release checks

Run `npm run check` and all browser suites listed in the README on the release commit. Complete the two-account hosted acceptance checks in setup and calendar setup: verified TAMU sign-in, pending approval, dancer/admin boundaries, private targeted work/payments, deactivation in an existing session, PDF replacement/archive access, and real calendar freshness. Verify Admin's operational export is denied to a dancer and signed-out visitor and succeeds for an active admin. Confirm `/api/health` returns liveness without credentials or private data; separately test actual database and Google access.

Test PDF upload/download near the application's 4 MiB limit on Vercel, including request overhead. Vercel documents a 4.5 MB function request/response payload limit, so local upload success alone does not validate production behavior. The operational JSON export is capped below that limit. Verify function duration in the selected project supports the calendar's bounded refresh. Provider limits can change; review [Vercel function limits](https://vercel.com/docs/functions/limitations) at release.

No cron is configured. Calendar refresh is request-driven with five-minute checks while its page is open. Hobby cron is limited to daily execution and has hourly timing precision; it cannot supply five-minute background freshness. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Do not claim continuous synchronization.

Complete an encrypted database-plus-Storage backup and separate-project restore drill in [operations](operations.md). Confirm monitor delivery and incident ownership before inviting the team. Record failed or pending live checks explicitly.

## Migration and rollback

Before each schema change, capture a verified recovery point including PDF bytes, review SQL and RLS changes, rehearse against staging, and record the last compatible application commit. Prefer additive changes that support both old and new deployments. Apply the schema before code that requires it; delay column/function removal until old deployments are retired.

For a bad app deployment, stop promotion and redeploy the last known compatible commit with the correct environment. Vercel rollback does not roll back Supabase data, migrations, or external settings. Confirm the old app works against the current schema and that its calendar configuration matches production. If it does not, keep affected writes unavailable while deploying a reviewed forward fix. There are no automatic down migrations; never reset the production database or blindly reverse a payment/audit change. Restore into a separate project for recovery assessment, then arrange a controlled cutover only after validating data loss and access policies. Record the incident, recovered point, and any writes needing reconciliation.
