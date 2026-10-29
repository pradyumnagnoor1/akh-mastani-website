# Budget privacy split

## G0 · 2026-10-29
- User correction: Budget moves to Management and is visible/readable only to Logistics & Finance, Captains and verified owner. Other active execs may add new expenses only, without viewing fund balances, allocations, ledgers, receipts or other expense records.
- Prior state: migration0020 and Budget application were live; all active execs could read Budget data. Need migration0021 before matching code release.
- Scope: transaction wrapper and financial RLS; submission-only season identifier; separate Add Expense page; management navigation; server route/action guards; desktop/mobile and SQL privacy tests; documentation.
- Trust boundary: UI hiding is insufficient. Postgres RLS and RPC guard deny direct reads and non-submit mutations. Existing reviewer separation and Good Bull rule remain in transaction implementation.
- Skills considered/chosen: project coding-orchestrator, project design-system, existing Genesis workflow, security/production readiness. No AI component. Independent fresh-context review required.

## Verification and release
- Migration0021 passed four focused PGlite privacy tests covering no financial rows for ordinary execs, new submission, denied edit/payment/refund/deletion/review and implementation RPC, current-season/Good Bull rules, and manager read access. Existing budget accounting suite still passes.
- Full `npm run check`: 46 test files/433 tests, typecheck, lint, build pass. Desktop and mobile Budget browser flows pass with ordinary exec redirected away from Budget and a separate submission form.
- Independent fresh-context review: APPROVE; no privacy or migration-safety findings. Genesis quiz questions recorded for user follow-up.
- Live Supabase SQL Editor applied the exact migration0021 transaction on 2026-10-29; UI reported `Success. No rows returned`. No live financial records were entered or changed.
- Matching app release and live signed-in role acceptance remain pending at this checkpoint.

## Production release · 2026-10-29
- Commit `790c9a4` fast-forwarded to `main` and pushed after live migration0021 succeeded. Vercel reported production deployment success and canonical `/api/health` returned 200.
- Using the existing signed-in owner browser session, `/budget` rendered under the Management heading and `/expenses/new` rendered the separate Add Expense page. It correctly shows setup pending because no season budget exists yet; no live financial record was created.
- Signed-in Captain/Finance/other-exec role acceptance remains unverified on their real accounts; SQL privacy tests and desktop/mobile browser fixtures passed locally.
