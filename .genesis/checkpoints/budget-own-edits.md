# Budget own-expense corrections

## G0 · 2026-10-29
- User clarified that ordinary active execs should be able to edit their own expense submissions. Budget and funds stay private to Finance, Captains and verified owner.
- Scope: migration0022 own-row read policy and pending-only RPC edit gate; Add Expense list and correction form with reviewer feedback; privacy/accounting/browser tests; docs and deployment.
- Skills considered: project coding-orchestrator, project design-system, Genesis L1/L4. Chosen all three; security review for the authorization boundary. No AI product capability.

## Verification
- `npm run check`: 46 test files/434 tests, typecheck, lint and production build pass. `npx playwright test --config=playwright.budget.config.ts`: desktop and mobile flows pass, including request changes, feedback, edit, resubmission and approval.
- Independent fresh-context reviewer initially found an approved-commitment reduction regression in copied transaction logic. Guard restored for approved entries; regression assertion added; reviewer APPROVE on the correction.
- Live migration0022 applied in authenticated Supabase SQL Editor; result `Success. No rows returned`. No financial records were created or changed.
- Browser tests use synthetic local identities. Real ordinary-exec and Captain/Finance sessions have not yet been exercised live; no season budget is configured in production.
- Genesis Q&A: user delegated the first two design/edge-case decisions to best judgment and explicitly answered correction-flow question: ordinary execs should be able to edit their own submissions.
