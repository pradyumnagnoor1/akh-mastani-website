# Compact funds controls
## G0 · 2026-11-02
Extend existing Funds/Expected Income UI: collapsed-by-default income, accessible forecast toggle button, corrected account subtitles, additive balance input. Existing balance reconciliation must remain distinct from actual credits. Scope: UI/actions, additive0030 RPC, tests/docs; project router/design and existing security/production workflow reused. User authorizes current feature and production release. No live financial writes. Independent L4 required.

## Verification
- Collapsed native disclosure, pressed-state toggle, auto-expand when clicking an expected segment, updated account descriptions. Add-to-balance form previews total and directs expected receipts to their existing workflow.
- Additive0030 RPC: Finance/owner only, positive bounded credit, required explanation, account/version/replay validation, funds_added audit. Existing balances untouched by migration. No reconciliation snapshot on credit.
- Independent APPROVE; 454 tests/full check/build and desktop/mobile Budget flows pass. Reviewer label polish applied: Funds added and Income received in balance history. No live financial writes. User must apply0030 for credits.
