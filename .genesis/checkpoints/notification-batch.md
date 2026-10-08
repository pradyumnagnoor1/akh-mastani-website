# Notification batch capacity

## G0 Existence Pre-Flight · 2026-10-08
- Existing Web Push implementation reused; current claim and worker caps are both 20.
- Read notifications/architecture wiki, current checkpoint, plan, definition of done and implementation notes.
- Verdict: PARTIAL — extend existing dispatcher to 40 device jobs per invocation.
- Skills considered: [agentic-swe-master, coding-orchestrator, modular-architecture, production-readiness, test-driven-development, writing-plans, verify]; chose available master/router/architecture/production skills and a focused behavioral regression + independent review. Supporting TDD/planning/verify skill files were not found in installed skills or documented kit directories.
- User-authorized scope: notification worker/dispatcher, existing worker test, notification runbook/wiki and Genesis progress records.
- Acceptance: claim and deliver up to 40 jobs; cap concurrency at 10; preserve consent, eligibility, payload privacy, retries, leases and timeouts. SQL already allows claims up to 50; no migration required.
- Plan: exercise 35/40/45-job boundaries in the existing worker test, observe failure, use one shared batch constant, update documentation, run quality checks and independent verification.
- Verification: focused push-worker tests, npm test, npm run typecheck, affected-file ESLint and Prettier checks.
- M7 hosted activation remains pending. Prior user-delegated quiz authorization recorded in push-notifications.md applies; no production deployment requested.

## Iteration 1 — BUILD
- G1: available skills loaded; routing above.
- G3: no new user token budget; existing one-iteration scope.
- Regression observed before implementation: focused worker tests exit1, three boundary cases delivered only20 instead of35/40/40.
- G2: dispatcher/worker share PUSH_BATCH_LIMIT=40; existing concurrency/privacy regression now covers35/40/45 jobs; runbook/wiki updated.
- G4: npm test exit0 (214 tests,25 files); npm run typecheck exit0; affected worker/dispatcher/test ESLint exit0 and Prettier check exit0.
- G5: fresh-context independent reviewer APPROVE, no blocking findings. Reviewer confirmed shared40-job cap,10 concurrent sends, eligibility/privacy/timeouts/retries/fencedleases retained and SQL accepts1–50. Reviewer independently ran8 worker and22 notification/management database tests successfully.
- No live push provider calls or deployment performed.

## User-delegated Q+A
Prior delegation recorded in push-notifications.md persists; these are assistant answers, not evidence of human understanding.
1. Why share dispatcher/worker capacity? A single limit prevents claiming more jobs than the worker will process, leaving unnecessary leased jobs behind.
2. What happens after lease expiry? Eligibility and completion RPCs require a current matching lease; expired work cannot commit a result and can be reclaimed/retried. Stable tags reduce duplicate visible alerts after ambiguous transport delivery.
3. How does40 affect duration at concurrency10? Four groups replace two; provider waits can total roughly20 seconds at five seconds each, plus database/network overhead. Concurrency stays10;60-second leases and existing function limits remain. Provider timing is not a guaranteed delivery deadline.

## Exit
Locally complete with214 tests, typecheck, affected lint/format and independent APPROVE. Redeploy app code to activate the new cap; no new SQL migration or environment changes. M7 production notification activation remains separate.
