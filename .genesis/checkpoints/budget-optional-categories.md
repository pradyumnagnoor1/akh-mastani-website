# Optional suggested budget categories

## G0 · 2026-10-29
- Existing Budget questionnaire and SQL migration 0023 require all nine suggested categories. The UI has removal only for custom rows; existing category allocations are retained by the RPC. Verdict: PARTIAL extension.
- Read Budget docs, Genesis plan/current checkpoint and implementation notes, project coding-orchestrator/design-system, agentic-swe-master, modular-architecture and production-readiness. The existing Next.js form guide confirms server-side validation. Skills considered: router, design, data/security and release; chose router, design and database verification for form+RPC boundary.
- Outcome: suggestions start populated for new budgets but can be removed and added back; at least one positive allocation remains mandatory. Editing can remove an unused category, while linked expenses cannot lose their allocation. Verify with `npm run check` and Budget Playwright desktop/mobile.

## Build and verify · 2026-10-29
- Suggested rows can be removed and re-added. Editing loads only saved allocations. Removing a category also removes its unsaved known costs; linked expenses block removal. Quick-add fee suggestions follow the chosen categories.
- Server validation accepts 1–40 categories with a positive total. Migration 0026 keeps existing category spelling and blocks removal when any expense history references the allocation; unrelated categories are deleted transactionally. Existing auth and fund checks remain in the replaced RPC.
- Independent review found cross-season expense blocking and missing-category quick-add buttons; both fixed. `npm run check` passed 444 tests, typecheck/lint/build; Budget desktop/mobile Playwright passed. Supabase production SQL Editor applied 0026 successfully.
- Production release 2b0b963 manually deployed from Vercel after Git push did not auto-start; deployment Ready and Vercel commit status success. Canonical health returned HTTP 200. Signed-in owner edit questionnaire showed Remove controls and add-back after removing Social; form was closed without saving.
