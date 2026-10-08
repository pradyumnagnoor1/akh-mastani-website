# AKH Mastani implementation plan

Goal: a private team hub with stable member identity, dancer participation plus manually granted admin rights, and at least one year of maintainable operation.
Execution: Genesis L1 BUILD / L2 DEBUG / L3 RESEARCH / independent L4 VERIFY. Use writing-plans for decomposition; Genesis governs execution and its quiz gate.
Stack: Next.js/TypeScript on Vercel, Supabase Auth/Postgres/private Storage, Google Calendar read-only synchronization.

## Brainstorm
A. Managed modular application (chosen): one Next.js application plus Supabase and Google Calendar. Strengths: one deployable codebase; relational permission rules. Weaknesses: external service setup; provider integration maintenance.
B. Custom API and self-managed database: separately operate frontend, API, and PostgreSQL. Strengths: full control; portability. Weaknesses: more services; increased maintenance for student handover.
C. Linked forms and spreadsheets: compose existing Google tools. Strengths: quick initial configuration; familiar tools. Weaknesses: fragmented experience; difficult private per-member workflows.
Choice: A fits the user's Vercel preference and year-long maintenance requirement with the fewest managed components.

## M1 — Identity and application foundation
Outcome: runnable responsive app with Google authentication integration, exact-domain checks, one-time name onboarding, pending/active/inactive membership, member roster and admin approval, and independent admin grants.
Freeze boundary: root configuration, src/**, tests/**, supabase/migrations/0001_identity.sql, scripts/**, docs/**, .github/**, .genesis/**. Do not modify the reference image or global skills.
Skills: canon + writing-plans + test-driven-development + security-engineering + design-system + requesting-code-review.
Demo: `npm run check` and `npm run test:e2e`.
Acceptance: unauthorized users cannot read roster data; ordinary members cannot grant admin or approve members; inactive users lose access despite an existing session; display-name completion is saved once; admins retain personal dancer identity. Unconfigured deployments show a setup state and never a fake working login. Real Google/Supabase validation remains an explicit M7 gate.
Steps:
- [ ] Write behavioral tests for domain eligibility, access destinations, and name validation; observe failures, implement policies.
- [ ] Write SQL permission tests against an embedded PostgreSQL engine; implement migration and RPCs, test direct forbidden operations.
- [ ] Configure Next.js and server-side Supabase clients with verified identity checks and bounded calls.
- [ ] Implement login/callback, onboarding, membership status, sign-out, protected Home, roster and admin membership view.
- [ ] Render at mobile/desktop widths, verify keyboard navigation and unconfigured access behavior.
- [ ] Run quality checks; obtain independent verdict and three user answers before marking complete.

## M2 — Segments and formation documents
Outcome: admins manage named segments, assigned members, and private PDFs; roster and Home reflect membership.
Freeze: src/features/segments/**, src/app/**, src/components/**, supabase/migrations/0002_segments.sql, tests/**, docs/**, .genesis/checkpoints/** and progress notes.
Demo: `npm run check && npm run test:e2e -- --grep segments`.
Acceptance: private PDF access; add/remove/rename segments; member assignment; upload/replace/open/download; no duplicate membership source.
Skills: canon + design-system + data-systems-engineering + security-engineering + test-driven-development.

## M3 — Announcements and tasks
Outcome: targeted communication and individual/shared task completion.
Freeze: src/features/communication/**, src/app/**, src/components/**, supabase/migrations/0003_communication.sql, tests/**, docs/**, progress notes.
Demo: `npm run check && npm run test:e2e -- --grep communication`.
Acceptance: individual/selected/group/segment/team audiences; snapshot recipients; independent completions; shared completion author; admin edit/reopen/archive; permission tests.
Skills: canon + design-system + data-systems-engineering + test-driven-development.

## M4 — Payment verification
Outcome: admins issue fines/charges and verify dancer payment reports.
Freeze: src/features/payments/**, src/app/**, src/components/**, supabase/migrations/0004_payments.sql, tests/**, docs/**, progress notes.
Demo: `npm run check && npm run test:e2e -- --grep payments`.
Acceptance: unpaid -> reported -> verified, rejected -> unpaid, waiver with reason; verified charges leave outstanding balance but remain in history; own-record privacy, atomic transitions, duplicate submission protection. No actual money transfer.
Skills: canon + security-engineering + data-systems-engineering + test-driven-development.

## M5 — Calendar synchronization
Outcome: read-only team schedule with five-minute freshness target and stale-data fallback.
Freeze: src/features/calendar/**, src/app/**, src/components/**, supabase/migrations/0005_calendar.sql, tests/**, docs/**, vercel.json, progress notes.
Demo: `npm run check && npm run test:e2e -- --grep calendar`.
Acceptance: private calendar authorization, changed/cancelled/recurring events, time zone, bounded retries, last-success timestamp, cached fallback, server-only credentials.
Skills: canon + distributed-systems + production-readiness + test-driven-development.

## M6 — Integrated dashboard and operations
Outcome: unified personal Home, admin summaries, monitoring, backups, exports, and handover docs.
Freeze: src/**, tests/**, docs/**, scripts/**, .github/**, root config, progress notes.
Demo: `npm run check && npm run test:e2e`.
Acceptance: all approved pages work; no Attendance/Benching/Dues/Reimbursements; admin remains dancer; documented backup/restore and ownership; privacy and cross-page tests pass.
Skills: canon + design-system + production-readiness + security-engineering.

## M7 — Live setup and release validation
Outcome: configured production services and user-reviewed release.
Freeze: configuration, deployment/runbooks, corrective fixes with recorded scope, progress notes.
Demo: `npm run check && npm run test:e2e` plus documented two-account live smoke checks and restore exercise.
Acceptance: actual TAMU OAuth, initial manual admin grant, second dancer access denial checks, protected file delivery, calendar synchronization, Vercel deployment, secrets and backup ownership verified. Automated local checks do not satisfy this live gate.
Skills: canon + production-readiness + security-engineering.

## Progress
M1 complete: independent APPROVE + user Q&A recorded. M2 complete with independent approval and user Q+A. M3 complete with independent approval and user-delegated review. M4 and M5 complete with independent approval and delegated review. M6 complete with independent approval, final regression verification and delegated review. M7 live service setup pending.

Scope amendment authorized by user: Calendar Connect extension replaces manual refresh-token setup with admin OAuth management; locally implemented and independently approved. M7 live setup still pending.

## User-authorized extension — Home Screen app and push
Installable Home Screen PWA with optin targeted push. Freeze: src/**, public/**, supabase/migrations/0007_push_notifications.sql, tests/**, scripts/**, docs/**, configuration and Genesis notes. Verify private data never cached offline, active recipient enforcement, subscription isolation, durable bounded retries and mobile install/permission states. Next/Vercel server + Supabase outbox; recurring scheduler configured separately for reminders/retry.

Home Screen/Web Push extension locally complete: 204 tests and48 browser flows; independent APPROVE and user-delegated quiz recorded. Migration0007/Vercel variables/SupabaseCron/physicaliPhone activation not performed; see docs/notifications.md.


## User-authorized extension — Automatic and pull refresh
Shared all-page30second visible/online soft refresh, resume/reconnect update, top-only mobile pull circle, draft/modal/submission protection. Freeze: rootlayout/shared clientcomponents/styles, calendarpresentation, browserchecks/config, refreshdocs/Genesisnotes. Retain upstreamcalendarcache, private server authorization and existing productpages. Local completion evidence: checkpoints/page-refresh.md; hosted deployment and physicalSafari gesture check remain separate.


## User-authorized extension — Admin CRUD and featured events
Explicit communication/group delete controls preserve archival history. Add auditable outstandingpayment edit/delete, title-bearing announcement pushes and custom featured-event CRUD with Calendar/Home display. Freeze src/**, additive migration0008, tests/config, docs andGenesisnotes. Current requirement supersedes original immutable-outstandingcharge and fullygenericannouncement preview assumptions. Settledamounts/UUID/audit/permission invariants remain. Local evidence checkpoints/crud-featured.md; apply migration0008 before code deployment and verify actualpush separately.
