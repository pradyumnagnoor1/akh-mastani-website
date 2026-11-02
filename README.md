# AKH Mastani

A private operations hub for the AKH Mastani dance team: announcements, practice planning, choreography, member payments, and role-scoped budgeting in one place.

Built with Next.js 16, React 19, TypeScript, and Supabase, and hosted on Vercel.

[Open the app](https://akh-mastani.vercel.app) · [Setup guide](docs/setup.md) · [Operations guide](docs/operations.md)

## What the team can do

- Read targeted announcements, track assigned to-dos, and use Today summaries.
- View Google Calendar practices and team-created events, with practice-linked announcements.
- View segment assignments and formation PDFs, browse the roster, and find choreography videos hosted in Google Drive.
- Report member payments for admin verification.
- Submit team expenses; eligible finance roles manage funds, category allocations, receipts, and approvals.
- Enable optional device notifications and install the app as a PWA.

Budget access is limited to Captains, Logistics & Finance, and the verified owner. Other active execs use Add Expense to submit and correct only their own pending or changes-requested entries. Expense approval requires a different eligible reviewer. See the [budget guide](docs/budget.md) for permissions and accounting behavior.

## Current status

The app is deployed at [akh-mastani.vercel.app](https://akh-mastani.vercel.app), backed by Supabase. Pages include Home, Announcements, To-Dos, Practice Calendar, Set Design, Payments, Add Expense, Roster, Choreo, Admin, and management-only Budget. Google Calendar supplies team schedules; Google Drive hosts Choreo videos.

Latest implementation and release evidence is recorded in [.genesis/checkpoints/CURRENT.md](.genesis/checkpoints/CURRENT.md). Reminder/edit previews and smart follow-ups are documented in [notifications](docs/notifications.md) and [digest nudges](docs/digest-nudges.md). For a new environment, start with [Supabase setup](docs/setup.md), [calendar setup](docs/calendar-setup.md), [deployment](docs/deployment.md), and [operations/handover](docs/operations.md). Apply migrations in order; retain historical migrations for clean installs and recovery. Consult the checkpoint for checks that remain unverified, including backup restoration.

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

`npm run typecheck` regenerates Next.js route types before checking TypeScript, so it works after a fresh checkout or cleanup. `next-env.d.ts` is generated and ignored.

The E2E server uses port 3100 and `.next-e2e`, separate from the normal development server. Its Supabase variables are explicitly empty. Configured sign-in, authenticated page interactions and token refresh require the live two-account checks in the setup guide before production release.

## Local disk cleanup

Stop local development/test servers, then run:

```sh
npm run clean
```

This removes generated Next.js builds and E2E caches, test reports, coverage and generated TypeScript files. It keeps installed dependencies, environment settings, Vercel project linking and source files. Builds/tests recreate their output as needed; run `npm run build` before `npm start` after cleaning. These generated folders are ignored by Git and excluded from Vercel uploads.

## Agent workflow

Read `AGENTS.md` and `.genesis/KICKOFF.md`. Keep the canonical plan, checkpoint and implementation notes current. Follow the independent review and three-question milestone gate in `.genesis/LOOPS.md`.

The segment browser suite runs an isolated, test-only PGlite/HTTP fixture on port 3201 and a configured Next server on port 3102 (`.next-e2e-segments`). It exercises admin and dancer forms with synthetic sessions and the real SQL migrations. It does not prove Google OAuth or hosted Supabase Storage behavior. The fixture is never imported into production code.
