# Choreo videos

The protected `/choreo` page uses the owner's team folder [Google Drive](https://drive.google.com/drive/folders/15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ). Every approved active app member can open the page. Google still enforces the TAMU folder's permissions when playing a video; sign into the correct TAMU account. Folder permissions are never made public or modified by this application.

The live gallery lists video files and nested folders directly from Drive, with name/folder search and a Google-hosted player. No videos or metadata snapshots are stored in the app database or service-worker cache. Reload/shared page refresh requests fresh Drive data, so deleted/trashed/moved-out videos disappear after Google reflects the change. Shortcuts and non-video files are excluded. Drive remains the place to add, rename and delete choreo videos.

## Connect the TAMU-restricted folder

A Supabase Google sign-in does not itself grant the server access to Google Drive. Use a read-only OAuth grant by a TAMU account that already has access. Enable Google Drive API in the owner's Google Cloud project, configure the OAuth consent/client under the institution's applicable policy, and obtain an offline refresh token for `https://www.googleapis.com/auth/drive.metadata.readonly`. The gallery needs metadata only; video playback is authorized separately in the dancer's Google browser session. A Calendar-only refresh token does not grant Drive access. [Google OAuth web-server/offline flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Set these **server-only** variables in ignored `.env.local` and Vercel Production, then redeploy:

- `GOOGLE_DRIVE_CHOREO_FOLDER=15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ` (already the code's default; URL also accepted).
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

Use the standard Google authorization-code flow with `access_type=offline`, exact registered callback, state verification and PKCE where applicable. For a one-time maintainer grant, Google's [OAuth Playground](https://developers.google.com/oauthplayground/) can use **your own OAuth credentials** with its registered redirect URI; select the metadata scope, grant access as the TAMU account, exchange the authorization code, and store the refresh token directly in the private secret store. Do not paste credentials/tokens into chat, commit them, or prefix any with NEXT_PUBLIC_. Google/TAMU consent restrictions may require institutional administrator approval; a domain-restricted folder cannot be accessed using a public API key. Reauthorize if the grant expires or is revoked. OAuth testing-mode grants may expire; configure the intended production consent status. [Google refresh-token behavior](https://developers.google.com/identity/protocols/oauth2#expiration).

An optional service-account connection uses `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` only if institutional sharing policy allows that account to be granted Viewer access to the folder. No domain-wide delegation is assumed. The optional `GOOGLE_DRIVE_API_KEY` mode is for already-public folders only. Neither alternative is needed for the configured TAMU OAuth mode. OAuth takes precedence; incomplete OAuth configuration produces an error rather than silently falling back.

Until credentials are configured, Choreo offers **Open folder** and an honest connection state. Listing failures show a retry action and the folder fallback. Google iframe playback can require sign-in or fail under browser cookie policy; **Open video in Drive** provides a direct fallback.

## Limits and acceptance

Reads are bounded to20 real folders,30 list pages and1,000 videos, with100 results/page, five-second requests and a20-second overall timeout. Oversized/incomplete or failed listings show an error; the app never substitutes a stale deleted-video snapshot. Fixed Google endpoints and validated IDs/resource keys prevent arbitrary endpoint/file selection. Credential values and provider error bodies never reach the client or application logs. [Drive listing](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).

After deployment, use an approved TAMU dancer and admin to verify the real nested video listing and playback on desktop and iPhone. Add/remove a test video in Drive and confirm the gallery updates. Verify logged-out, pending and deactivated users cannot open Choreo. Check the wrong Google account fails playback rather than exposing the video. Local browser tests use a synthetic Google upstream/player; they do not establish live folder access or Google playback. No Drive credentials or live folder access were available during this implementation.
