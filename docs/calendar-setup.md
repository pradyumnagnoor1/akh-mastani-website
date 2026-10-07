# Calendar synchronization

Security policy: only verified active TAMU members may read the team schedule or trigger a refresh. Calendar edits remain in Google Calendar. Only the server calendar adapter may claim, finish or fail refreshes; all three write RPCs are denied to anonymous and authenticated clients. Google credentials and the Supabase secret key never reach browser bundles, responses or logs. An authorization/database failure fails closed, including when cached data exists.

Consistency: one atomically replaced, eventually consistent snapshot. Google outages retain the last complete snapshot with a stale label. PostgreSQL owns lease and freshness clocks; token fencing prevents expired workers from overwriting newer results. This tolerates a failed Google request or crashed refresh worker, not a failed database: identity and snapshot access require Supabase.

The schedule window includes the past 30 and next 180 days. One request may refresh every 300 seconds; an open page checks every five minutes and on focus. This is a freshness target while in use, not a continuous background synchronization guarantee. Vercel Hobby only permits daily cron, so no five-minute cron is deployed.

## Connect a private team calendar

The website now has an admin-only **Connect Google Calendar** flow. Dancers do not use OAuth Playground or grant calendar permissions. An admin authorizes an account with access to the team calendar; the server stores its refresh token encrypted.

### One-time infrastructure setup

1. In the calendar's Google Cloud project, enable **Google Calendar API** and configure a **Web application** OAuth client. This connection is separate from dancer sign-in. Request only `https://www.googleapis.com/auth/calendar.events.readonly`. Google grants this scope for accessible calendars, not only the selected calendar; use a dedicated team account with limited access when possible.
2. Register the exact website callback under this client's **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/calendar/oauth/callback`
   - Production: `https://YOUR-VERCEL-DOMAIN/api/calendar/oauth/callback`
     Use the real domain, no trailing slash, and match `APP_ORIGIN`. Keep the dancer sign-in client's Supabase callback separate. OAuth Playground is no longer needed.
3. For External apps in Testing, add the authorizing account under Google Auth Platform → Audience → Test users. Calendar refresh tokens issued in Testing expire after seven days. Address publishing/verification requirements before year-long use; the connect button does not bypass Google or university policy.
4. Set server-only `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `SUPABASE_SECRET_KEY`, and `CALENDAR_TOKEN_ENCRYPTION_KEY` in ignored `.env.local` and Vercel environment settings. Generate the encryption key once with `openssl rand -base64 32` and save it in the team password manager. Never prefix any of these with `NEXT_PUBLIC_` or send their values in chat. Retain the same encryption key across deployments; losing it requires reconnection.
5. Apply migrations through `0005_calendar.sql`, then run `supabase/migrations/0006_calendar_connection.sql` once. Redeploy/restart after environment changes. Migration0006 starts with a disconnected connection and clears the path for website-managed authorization. Existing `GOOGLE_CALENDAR_REFRESH_TOKEN` environment values are no longer used; remove them. `GOOGLE_CALENDAR_ID` is optional form prefill only.

### Authorize from the website

1. Sign into the team website as an approved admin and open **Admin → Connect Google Calendar**.
2. In Google Calendar, find Settings → your team calendar → Integrate calendar → **Calendar ID**. Enter that ID in the website; a private iCal URL is not the ID. Avoid `primary`, which depends on the selected account.
3. Click **Connect Google Calendar**, choose an account that can see the calendar's event details, and approve read-only access. Free/busy-only access is insufficient.
4. Google returns to the website. The server validates the attempt and calendar access, encrypts the refresh token and saves the connection. You never copy the token. Open Practice Calendar to confirm a real synchronization.
5. Use **Reconnect Google Calendar** after revoked/expired authorization or ownership changes. **Disconnect calendar** deletes the stored token and shared cached schedule; it does not revoke the Google account's grant. To revoke that grant as well, remove the app in that account's Google third-party connections. Cancelling consent or a failed connection preserves the existing working connection. Changes made while another connection attempt is open cause the older callback to fail rather than overwrite them.

### Required hosted checks

Verify known timed/all-day/recurring practices, cancellations/reschedules and changes after five minutes. Confirm dancers cannot open connection management or start/disconnect OAuth, pending/inactive accounts cannot read schedule/cache, an admin revoked during authorization cannot complete it, and stale callbacks cannot restore disconnected credentials. Exercise cancellation/replay, reconnect, disconnect, encrypted database credentials, and Google outage fallback on a test calendar. Local fixtures and tests do not prove live Google/Supabase behavior.

## Operation and recovery

The server obtains a Google access token from the refresh token for each claimed refresh. The token and every Google response remain server-side; only normalized schedule fields are returned. A full 210-day window is replaced atomically after every page validates. Cancellation and moved-out-of-window events disappear on the next successful replacement. Google expands recurring instances. All-day dates retain their exclusive end; timed events display in America/Chicago across DST.

The Google budget is 15 seconds total, at most four pages of 250 events, and one transient retry with short jitter across the whole refresh. PostgreSQL grants a 30-second lease and fences completion with the source fingerprint, token, and lease expiry. Failed refreshes have a 60-second shared cooldown. The source fingerprint hashes the calendar ID, OAuth client ID and connection version; reconnecting or disconnecting fences old refresh workers and clears the snapshot. Do not run production deployments with conflicting calendar configuration against one database.

The server's separate Supabase client only calls calendar RPCs. Its secret key is nevertheless privileged across the project, bypasses RLS, and is **not** a calendar-scoped credential. Use a dedicated named secret key for rotation. This migration revokes direct cache-table access from `service_role`; the security-definer RPCs have explicit grants and fixed search paths. Member reads still use their session and RLS; auth/database errors fail closed. Keep preview environments isolated from production credentials and data.

Sanitized failure codes: `authorization` means reconnect/check calendar access; `upstream` or `timeout` means Google/network failure; `invalid_response` means unexpected data; `capacity` means the bounded window exceeds limits; `storage` means cache persistence failed. No raw provider response or credential is logged. A stale timestamp and retained schedule are intentionally visible. Never manually advance `last_success_at` to silence a warning. On `capacity`, inspect event volume before changing the window/page budget. On `authorization`, use the admin reconnect flow. On source changes, a fresh authorized request clears the old persisted cache before refreshing; unconfigured server responses never return the previous cache.

Vercel Hobby cannot schedule five-minute cron. Request-driven refresh and visible-page polling meet the intended freshness target during use. A strict always-on freshness requirement needs an explicitly configured external scheduler or an eligible Vercel plan. No cron endpoint is exposed by this implementation.

References: [Google events listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [event dates and recurrence](https://developers.google.com/workspace/calendar/api/v3/reference/events), [offline OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [refresh token lifecycle](https://developers.google.com/identity/protocols/oauth2), [error handling](https://developers.google.com/workspace/calendar/api/guides/errors), [Supabase secret keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Credential storage and recovery

Migration0006 denies all API roles direct access to connection/attempt tables. Only server-only RPCs can read encrypted credentials or change the connection; status RPC returns sanitized metadata to current admins. OAuth attempts expire after ten minutes, are one-use, and bind the current admin, state and PKCE verifier. The HttpOnly state cookie is encrypted; callback responses redirect without private data and use no-store/no-referrer headers.

The token uses AES-256-GCM with a random nonce and purpose/connection binding. The encryption key lives outside the database in server environment settings. Database backup alone does not include that key. Store it separately in the team password manager; keep old keys available for retained encrypted backups. To rotate it, use a maintenance window, set the new key and reconnect from Admin (old token decryption will fail until reconnection). A leaked key requires rotation and renewed Google authorization; coordinate revocation of superseded grants with the calendar owner. Production request logs/monitoring must redact OAuth callback query parameters (`code` and `state`); this code never logs provider responses or tokens.
