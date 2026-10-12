# Announcement notification body preview · 2026-10-12
- G0: notification dispatcher uses private push_prepare_delivery; existing SQL queue stores generic body. Reuse sender/service worker unchanged.
- Skills: master/router, data-systems-engineering, production-readiness. Scope additive0013, SQL regression/fixture, docs/checkpoints. Owner requests title/body lock-screen previews and production fix.
- Acceptance: valid leased announcement change alerts use current title and normalized body capped240Unicodecharacters; unauthorized/removed audience suppresses; pending jobs covered; generic task/payment/nudge messages preserved. No test blast.
- Verify: affected PostgreSQL tests then full unit/SQL, typecheck,lint and independent L4; apply narrow owner SQL migration then publish testedcode/docs.

- Verification:332unit/SQL tests/38suites, typecheck and affected lint/format pass; independent verify_announcement_preview APPROVE with23/23affectedSQLtests. No browser UI code changed; existing serviceworker displays payload.body.
- Delegated Q+A under prior authorization (assistant answers, not human-understanding proof): send-time content reflects edits and pendingjobs; lost access yieldsnull before body lookup;0013 updates unsent delivery payloads, never replays sent alerts, keeps nudge bundles generic.
- Testfixture adjustment: whitespace-only spaces violate current bodyconstraint; newline/tab-only stored text validly exercises normalized-empty fallback.

- Live owner SQL applied exact0013 transaction successfully. Existing production worker uses same RPC, so change is effective immediately without frontend redeployment. No synthetic content or test notification sends. Physical-phone acceptance remains unverified.
