# Budget setup controls

## G0 · 2026-10-29
- Read Budget wiki/implementation notes, current checkpoint, existing questionnaire and migrations 0020–0023. Existing allocation/approval/fund ledger system is live; deletion, in-questionnaire fund snapshots and circle graph are unbuilt. Verdict: PARTIAL extension.
- Scope: five-step budget setup, safe budget deletion, planned-expense removal, chart choice on all categories, updated fund-card label. Preserve Good Bull and independent expense approval rules, account history and private deleted payments.
- Skills considered: project coding-orchestrator, design-system, agentic-swe-master/Genesis; chose those plus database privacy tests and independent review. Browser → Next action → Supabase RPC remains the trust boundary.
- Demo: `npm run check` and `npx playwright test --config=playwright.budget.config.ts`.

## Build · 2026-10-29
- Database 0024 adds current-balance snapshots to the setup transaction and archives only budgets with no active expenses; latest active season RPC skips archived budgets. Fund balances and history are independent of a deleted budget.
- Five-step questionnaire, planned-expense remove/cancel flow, overall chart switch, category bars and fund-card wording implemented.
- G1/G2/G3: project skills loaded, requested behavior implemented, no dependency/environment changes.
- G4/G5: pending full check and independent review.
