# UI revamp — user-authorized (2026-10-22)

## Scope
- User asked for a deep mobile review, a revamp plan, then "make the UI cleaner and better… execute plan". Presentation only: no schema, env, auth, action or query changes.
- Decisions taken from the plan's recommendations: keep dark/violet identity and tighten it; membership details move to the sidebar/drawer account area; check button on to-dos (no swipe).

## Evidence before
- iPhone 13 screenshots with seeded fixture data: admin Home ~4,600px (duplicate to-do/announcement/practice panels), Admin ~3,000px, announcement cards ~650px each, new-announcement Publish ~3 screens down, all payment statuses grey.

## Changes
- `globals.css` rewritten as one ordered system (tokens → base → primitives → frame → patterns → pages → responsive → motion); semantic status chips, segmented view tabs, flat cards, one page rhythm, sticky editor action bar, compact loading pill, desktop content capped at 960px.
- Home: Today card → Next practices + Your payments → featured strip → segment chips → Admin overview → Notifications. CommunicationHome removed (duplicate of Today digest).
- Cards: status/due chips, title, attribution, 2-line excerpt, one action row; completion-type chip only for shared items or writers. Payments: amount + coloured status on the right, readable dates, Chicago activity times.
- Admin: Manage / Members & requests / Data sections; pending notice only when pending; exec-role editor starts collapsed.
- Tests: Home "Your to-dos" assertions moved to the Today region (navigation.spec, practice.spec).

## Verification
- typecheck, lint, format, 393 unit/SQL tests, production build pass (build needs a retry past the Next 16.4.0 security-upgrade gate).
- Team browser suite run against a pre-started dev server (the gate stops Playwright-launched servers): see final counts in the session report. Baseline (original code) full run: 129 passed / 4 failed (calendar ordering, digest Today, two mobile navigation taps blocked by the Next dev "Security Insight" toast).
- After screenshots: admin Home ~2,430px, Admin ~1,860px, To-Dos ~1,390px with the same seed data.

## Open
- Next.js security upgrade (`next upgrade --agent=security`) not run; awaiting user decision.
- Physical iPhone check of sticky editor bar with keyboard pending.
