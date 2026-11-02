# Optional funding source for recorded payments
## G0 · 2026-11-02
Existing expense forms and RPC reused; PARTIAL. Read wiki index/architecture, Budget docs, current checkpoint, plan/spec and implementation-note searches. Cause: unconditional HTML required plus non-null database foreign key. Scope: Budget forms/types/action, additive migration, regression tests and docs.
Skills considered: router, design-system, detective, modular-architecture, production-readiness; chose these with agentic-swe-master (found under Desktop/Projects). Existing bug; no AI; browser/server/database boundary; preserve finance permissions and second-person approval. Verify with typecheck, lint, unit/SQL tests and Budget browser tests; fresh-context checker required.

## Implementation and review
- Both expense entry forms bind the recorded-balance checkbox to optional Pay from validation; returning to Not paid restores the requirement. Optional sources are labeled, and saved source-free expenses show an explicit fallback.
- Additive migration 0027 permits NULL sources only for submitted nonzero recorded payments, preserves existing source/category invariants, and rejects actual balance changes without a source. Later payments/refunds can assign a previously unspecified eligible fund. Existing review and cancellation audits remain in use.
- Fresh-context independent checker APPROVE, focused SQL tests 13/13. Full `npm run check` passed with 447 tests, typecheck, lint and build using locked dependencies. A copied dependency tree was replaced with `npm ci` after a version mismatch; no dependency manifest changes.
- Review rationale (standing delegated Q+A): optional source means no fund attribution, not an invented account; partial recorded payments still need a source before future balance changes; migration drops NOT NULL while enforcing mutation guards and preserving history.
- Deployment pending: apply 0027 after 0026, then deploy matching app code. No production financial records changed.

- Final desktop/mobile Budget Playwright flows both pass, including checkbox toggle, return to unpaid, source-free submission and second-person approval. Earlier browser failure was fixture state from leaving the new record pending between projects; completing its approval resolved isolation.

## Production release · 2026-11-02
- User confirms migration 0027 applied and explicitly authorizes production push/deployment. Remote main README update fast-forwarded before release; reviewed application source unchanged.
