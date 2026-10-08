# Migration0008 recovery

## G0 Existence Pre-Flight · 2026-10-08
- Current M7 checkpoint, PLAN/DONE, operations wiki and migration0008/0009 inspected. EXISTING:0008 management schema; PARTIAL: manual SQL rerun/resumption support. User reports42723 manage_payment_charge already exists; live schema unknown, so do not infer complete installation or skip remaining statements.
- Skills considered: coding-orchestrator, agentic-swe-master, production-readiness, data-systems-engineering, modular-architecture, systematic-debugging/verify equivalents. Chose available canon + database skills for data-preserving retry and production-version guard. Required review capability through fresh L4; no frontend/API code changed.
- Hypotheses:0008 entirely applied; only early statements applied; a compatible older/manual function exists. Embedded PostgreSQL reproduces complete and prefix-only states; no hosted schema read claimed.
- Scope:0008 migration, management database tests, recovery runbook, Genesis checkpoint/notes. No live database execution or data deletion.
- Plan: regression tests for repeated populated0008 and prefix-only resumption, later0009 refusal with unchanged state; transaction and create-or-replace/conditional DDL for known schema; fail closed if0009 has started; full unit/SQL/typecheck/lint and independent review.
- Acceptance:0008 rerun before0009 succeeds without duplicate rows/alerts/history or changed UUID/balances; existing active rows/ACL preserved; schema completed after prefix interruption; an error rolls back all migration changes; applying0008 after0009 is refused before changing deletion/privacy behavior.

## BUILD / DEBUG evidence
- Exact42723 reproduced with original0008: three new regression cases failed,10 prior tests passed.
- Corrected0008: full-file transaction,10s lock timeout + transaction advisory lock, later0009 guard before mutation, replace same-signature functions, conditional tables/index, recreate own policies/trigger. No business-row deletion/update; original deterministic pending announcement payload update retained.
- Added four behavior tests: prefix-only resume; populated replay plus missing object recovery/permission checks;0009 refusal with preserved hard-delete/payment privacy behavior; injected late failure rollback + successful retry.
- G4 npm run check exit0:240 tests/28 suites, typecheck/lint/build passed. npm run format:check exit0. Browser checks omitted because only SQL/test/runbook changes; previous frontend behavior unchanged.
- G3 exact token telemetry unavailable, not fabricated. Fresh L4 review requested; no production DB execution or repair claimed.

## Independent review correction
- Reviewer reproduced earliest0009 FK-only prefix accepted by initial later-marker guard. Added original featured_event_audit FK check so both first DROP and DROP+CASCADE prefixes refuse0008 before changing behavior, even without formation_cleanup/delete_team_item. Two real SQL regressions added;16/16 management tests pass. Existing malformed/manual FK state also fails closed rather than silently reviving old behavior.

## G5 / final computed evidence
- Fresh reviewer review_migration_resume APPROVE; independently42/42 focused management/push/payment SQL tests passed. Also subscribed-dancer replay preserved two existing jobs and next event update added exactly one; row/UUID, RLS, internal ACL and transaction checks passed. No hosted DB accessed.
- npm run check final exit0:242 tests/28 suites; typecheck/lint/build passed. npm run format:check exit0. Six new recovery regression cases total. Local fix complete; user executes current full0008 in SQL Editor before0009, not older snippets. Refuse older0008 if0009 started/present.

## User-delegated Q+A
Prior delegated review authorization persists; assistant answers below are not evidence of human understanding.
1. Why replace functions/conditionally create rather than drop? Preserve existing rows, UUIDs, dependencies and object identity; replace executable definitions and repair own policies/trigger atomically while reruns avoid duplicate-object errors.
2. What if0009 stopped immediately after dropping the event-audit FK? The original-FK predicate detects the missing constraint before any0008 DDL, raises a refusal, and the attempt rolls back. Do not force older behavior through that guard.
3. Which records/UUIDs and alerts should replay preserve? Existing members/events/charges/batches/audits and their IDs, state and balances remain; queued jobs remain, pending announcement-title normalization is deterministic, no new notification jobs from replay. Subsequent genuine event changes still enqueue exactly one alert per device/version.
