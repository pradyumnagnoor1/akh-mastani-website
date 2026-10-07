# AKH Mastani team hub

Private dance-team website built with Next.js, TypeScript and Supabase, targeting Vercel.

## Current status

Identity, Set Design, announcements/to-dos, payments, calendar synchronization, and integrated dashboard/operations are implemented locally. The current review/release gate is recorded in `.genesis/checkpoints/`; implementation does not imply milestone approval or production readiness. All eight pages are present: Home, Announcements, To-Dos, Practice Calendar, Set Design, Payments, Roster, and Admin.

No Supabase project or production deployment has been created for this work. Google sign-in, hosted RLS/Storage behavior, real calendar access, backup restoration, and Vercel acceptance remain live release checks. Start with [Supabase setup](docs/setup.md), [calendar setup](docs/calendar-setup.md), [deployment](docs/deployment.md), and [operations/handover](docs/operations.md).

Admins connect the shared schedule through Admin → Connect Google Calendar. The server stores its token encrypted; dancers do not authorize calendar access. Apply migration0006 and follow the calendar setup guide before using that flow.

Every member is a dancer. Admin access is an additional permission manually granted by the project owner. No first-signup admin behavior or public admin-grant endpoint exists.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Without configuration, the sign-in page shows setup status and disables Google login. It does not offer a mock sign-in or expose team records.

Follow [Supabase setup](docs/setup.md) to enable real sign-in.

## Verify

```sh
npm run check
npm run test:e2e
npm run test:e2e:segments
npm run test:e2e:communication
npm run test:e2e:payments
npm run test:e2e:calendar
npm run test:e2e:operations
# Or run all configured team workflows together:
npm run test:e2e:team
```

Unit tests cover identity rules. Database tests execute the migration and RLS rules in PGlite (embedded PostgreSQL) with a minimal test-only `auth.users` and `auth.uid()` harness. They do not simulate Google's OAuth service or replace live Supabase checks. Browser tests cover the unconfigured application's mobile/desktop layout and closed access boundaries. On macOS these use installed Google Chrome; Linux CI installs Playwright Chromium.

The E2E server uses port 3100 and `.next-e2e`, separate from the normal development server. Its Supabase variables are explicitly empty. Configured sign-in, authenticated page interactions and token refresh require the live two-account checks in the setup guide before production release.

## Agent workflow

Read `AGENTS.md` and `.genesis/KICKOFF.md`. Keep the canonical plan, checkpoint and implementation notes current. Follow the independent review and three-question milestone gate in `.genesis/LOOPS.md`.

The segment browser suite runs an isolated, test-only PGlite/HTTP fixture on port 3201 and a configured Next server on port 3102 (`.next-e2e-segments`). It exercises admin and dancer forms with synthetic sessions and the real SQL migrations. It does not prove Google OAuth or hosted Supabase Storage behavior. The fixture is never imported into production code.
