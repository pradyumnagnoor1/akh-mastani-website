# Pre-production on Vercel Hobby

Pre-production uses the `preview` Git branch and Vercel's standard Preview
environment in the existing `akh-mastani` project. Production tracks `main`.

Stable URL:
https://akh-mastani-git-preview-pradyumn-agnoors-projects.vercel.app

The owner explicitly authorized using the production Supabase database on
2026-10-12. Team records, uploaded files, accounts and calendar connection are
shared. Editing or deleting records in Preview affects the live team data.

The `preview` branch has its own `APP_ORIGIN` matching the stable URL above.
Supabase allows that origin's exact `/auth/callback` in addition to the existing
production and local callbacks. The Supabase Site URL remains the production URL.
Existing Vercel Authentication deployment protection is enabled; sign into
Vercel when prompted before signing into the app with your TAMU account.

## Deploy with the CLI

From this repository on the `preview` branch:

```sh
npx --yes vercel@latest deploy --target preview --yes
npx --yes vercel@latest alias set <deployment-hostname> akh-mastani-git-preview-pradyumn-agnoors-projects.vercel.app
```

Use the deployment hostname returned by the first command. The alias keeps
the sign-in callback and saved link stable. Push branch changes to GitHub as
usual; the explicit CLI commands also work when a push does not initiate a build.

`.vercel/project.json` is local project-link metadata and is ignored by Git.
`.vercelignore` excludes environment files and generated build/test output from
CLI uploads. Runtime configuration comes from Vercel Preview variables. Keep the
branch-specific origin when updating them.

## Verification and limits

The initial CLI Preview builds reached Ready; protected `/api/health` returned
`{"status":"ok"}`. The exact Supabase redirect was verified in the dashboard.
The protected login page returned HTTP 200 with Google sign-in enabled; an
unauthenticated request returned HTTP 302 to Vercel authentication.
No synthetic announcements, payments, uploads, or other team records were created.
Interactive Google sign-in and authenticated CRUD are not claimed as verified.

The saved Google Calendar connection is shared. To reconnect Calendar from
Preview, first add the stable origin's `/api/calendar/oauth/callback` to the
calendar OAuth client's authorized redirect URIs in Google Cloud. That separate
Google Cloud setting was not changed during this setup.
