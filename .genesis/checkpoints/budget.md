# Budget feature

## G0 · 2026-10-28
- Read identity, payments, architecture, index, PLAN, CURRENT and relevant implementation notes. Existing budget implementation: none. Existing payments remain separate.
- Verdict: UNBUILT. Reuse session validation, RLS/RPC boundaries, mobile tokens and native dialog pattern.
- Diagnostic: existing extension; no AI; browser/Next/Supabase boundaries; private financial records and role grants; architecture/frontend/backend/security/data phases.
- Skills considered: master, router, modular architecture, production readiness, security engineering, design system, writing-plans/TDD. Loaded available master (relocated under Desktop/Projects), project router/design and foundational skills. Planning/TDD behavior recorded here; named optional skills unavailable.
- Scope: src/features/budget/**, budget pages/components/styles, identity/navigation integration, migration0020, scripts/budget*, tests, docs, Genesis progress.
- Permission policy: active execs view/submit; Captain or Logistics & Finance review; finance and explicit owner manage limits/balances; no self-review, including owner. Explicit budget grants use verified permanent member IDs, never runtime display-name authorization. No unrelated admin escalation.
- Threats: ordinary dancers reading financial records, exec self-review, forged amounts/source, replayed approvals, stale balance overwrites, private receipt leaks. Enforce in SQL and test forbidden operations.
- Accounting: integer cents; source/category fixed after verified payment; pending items reserve total less verified paid; approvals deduct only incremental verified payment, once; negative availability displayed honestly. Explicit already-in-balance flag audited. Reconciliation fences pending reported payments.
- Plan: transactional schema/RPC and tests; query/action boundary; responsive Funds/Allocated Budget/Expenses UI; protected receipts/import/export; member assignment script; local and browser verification; independent fresh-context review.
- Demo: npm run check; focused budget SQL/policy tests; desktop/mobile budget browser flows.
- Live grants/migration/deployment must be reported separately from local verification.

## Local verification · 2026-10-28
- Migrations/RLS/RPC: 24 focused SQL and domain tests pass, including forbidden reads/writes, reviewer separation, Good Bull restriction, partial payments, refunds, reconciliation, soft-hidden paid deletion, atomic import and stale revisions.
- Frontend: desktop and mobile Playwright flows pass, including actual fixture form submission, Captain review, two approved payment deductions, category visual, ordinary-dancer denial and no horizontal overflow. Viewed rendered desktop/mobile screenshots.
- Full `npm run check`: exit 0, 45 test files/427 tests, typecheck/lint/build pass. `npm audit`: zero vulnerabilities after Next.js 16.4.3 and dependency security updates.
- Independent fresh-context review: first REJECT for season/event mismatch; fixed. Second REJECT for refund correction/reconciliation cases; fixed and tested. Final APPROVE for accounting and permission boundary.
- No production migration, deployment, seeded balances or budget limits. Existing six exec identities/roles were verified read-only against live members; Trinay profile is `Trinay Akula Kamalesh`. Owner account verified as `pradyumnagnoor@tamu.edu`; migration grants Budget owner access when applied.
- Hosted release acceptance remains pending. No production state was changed.

## Cancellation clarification and Genesis Q+A · 2026-10-29
- Q1, reviewer separation: User answered that all payments should be verified regardless of who entered the expense. The no-self-review rule remains enforced for Finance and owner.
- Q2, reconciliation boundary: User asked what reconciliation means. Explained with an actual-versus-recorded account balance example and that a pending refund must be reviewed before replacing the recorded balance. User accepted: “yea sure that reconcilation works”.
- Q3, deletion impact: User clarified that cancelling a paid Budget expense should reverse its effects while retaining deleted payment history somewhere. Updated cancellation to remove it from active budget totals, reverse only account-balance deltas since the last recorded actual balance, and preserve the private expense/payment/cancellation audit in the database. Existing dancer Payments remain untouched.
- Independent fresh-context accounting/security review of the clarification: APPROVE. Focused SQL tests, including reversal/refund/reconciliation/duplicate cancellation, pass. Full `npm run check` passed (45 files, 429 tests, typecheck, lint, production build). Desktop/mobile Budget Playwright flows pass. `git diff --check` clean.
- Genesis L4 Q+A gate satisfied. Hosted deployment remains pending; no production state was changed during local implementation.

## Live migration report · 2026-10-29
- User reported applying `0020_budget.sql`. Read-only REST verification against the existing live Supabase project returned the three expected Budget funds and Budget seasons table (no seasons entered yet).
- Exactly one `budget_owners` grant exists and matches the active admin member with verified owner email. No live balances, allocations, expenses, or app deployment were changed by this verification.
- Matching application code deployment and signed-in browser acceptance remain pending.
