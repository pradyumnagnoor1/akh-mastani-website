# Version 2.1

## G0 · 2026-11-04

- Wiki inspected: calendar, communication; implementation notes searched for calendar and announcements.
- Existing source confirms custom practice creation, Google/custom merging, reminders, featured events, and communication management. Pins, priority and separate release pages are new.
- Verdict: PARTIAL; extend existing features following docs/version-2.1-plan.md and the user's event-first clarification.
- User authorized implementation and parallel subagents. Three makers own practices/calendar, pins/priority, and Updates/navigation respectively.
- Skills considered: project coding-orchestrator/design-system, master, modular-architecture, production-readiness, Postman api-engineer. Chosen for existing module boundaries, protected database changes, frontend behavior and contract verification. No new external integration required.
- Scope: approved plan's src/tests/migrations/documentation/package changes. Verification: npm run check, affected desktop/mobile browser flows, independent review.

## In progress

- Dependencies installed with npm ci. Existing lockfile resolves 8 moderate audit findings; no dependency versions changed.
- Existing SQL/RPC tests and application fixtures will verify changed contracts; no separate public API is introduced. Postman status shows no initialized resources or account; unrelated workspace setup is unnecessary for this change.
- Implementation and verification pending. No deployment or live database changes performed.

## Implementation and verification
- Implemented event-first practice announcements, default General, Google reference-only operational separation, featured events above date controls, targeted event ownership/privacy/reminders and deletion cleanup. Legacy unchanged associations preserved; direct event attachment and owned detach blocked.
- Implemented audience-safe pins and task/linked-task priorities, filters, sorting, Home labels and exports. Atomic publication; metadata audit does not generate notification blasts.
- Implemented member/admin Updates with server-only private content and2.1.0 version metadata.
- Final npm run check passed:473tests/52files, typecheck, lint, production build. Full Prettier check and git diff --check passed.
- Desktop/mobile browser: practice2/2, pins/priority2/2, Updates/access2/2 passed against synthetic database fixtures. Live Google/Supabase/deployment/physical-phone verification not performed.
- Independent practice and Updates reviews APPROVE after findings fixed; metadata blast regression fixed and SQL verified. Additional practice guard tests cover direct attach, detach, and legacy edit.
- User Q+A recorded: (1) everyone on the app should see targeted practice details; implemented active-member event visibility while announcement text/reminders retain their audience. (2) no notifications for pin/priority edits; verified. (3) user delegates edit behavior; preserve priority and completion history. Corrected visibility independently APPROVED;7 focused SQL tests pass. Local implementation complete; live release remains pending.
- Release requires0033 then0034 and matching code deployment; see docs/version-2.1-release.md. No production changes performed.
