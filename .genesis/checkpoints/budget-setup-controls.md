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
- G4/G5: full check and independent review completed; reviewer found signed-balance and season-switch edge cases, both fixed.

## UI refinement · 2026-10-29
- User refined Funds to a segmented account-balance summary and three ledgers, removed old-sheet import button, and shrank the approval prompt to a badge button.
- Allocated Budget now uses a circle only for all categories; category selection hides the grid/revision controls and shows the category bar, associated expenses and known costs, with an explicit return button.
- Known expenses can be removed from Allocated Budget. Planned-only removal uses `budget_remove_planned` with a version check and audit event; linked expenses route through the existing reasoned cancellation flow. Fund ledger labels active linked items as known expenses.
- Existing unpaid expense cancellation remains permanently destructive by prior product policy; reported/paid cancellation retains private payment history. Budget deletion itself does not cancel expenses and is blocked while active expenses exist.
- 0024 was already live. Follow-up migration 0025 adds the remove-planned RPC and permits signed fund snapshots; SQL Editor returned Success. No rows returned. Unit/SQL suite: 442 tests; typecheck, lint, production build, and desktop/mobile Budget flows pass.
