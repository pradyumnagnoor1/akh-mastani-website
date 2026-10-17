# Admin-only exec eligibility and collapsed controls · 2026-10-16

## G0
- Existing: Admin page limited viewer to raw/manual admin via is_owner; action and set_exec_roles SQL enforce same caller permission. All active members previously appeared as targets. Existing role form always expanded. PARTIAL; extend those controls, no new pages.
- User explicitly clarified only existing admin members can receive roles. Require active target raw is_admin, distinct from effective exec management permission. Keep existing assignments/access; do not change live member records.
- Skills considered/chosen: coding-orchestrator + design-system for shared form UX; existing security/data/production guidance for SQL authorization. Freeze Admin page/role form/action, additive0016, focused SQL/browser fixtures/tests, docs/checkpoint.
- Acceptance: eligible target only in UI and RPC; collapsed Change exec role after saved role; reopen/cancel/save/pending states preserve exact saved roles, CAS conflicts remain; no grants to ordinary or inactive members.

## Verification
- Review identified pending-save Cancel race; fixed by disabling fieldset/Cancel while pending and synchronizing selected+expected to actual submitted roles after success. New delayed-response regression proves it.
- Initial browser helper had a hydration timing race checking a missing Change button before page content was ready; waits for editor or button before branching.
-0016 locks eligible target before CAS update; nonempty assignment requires existing active raw admin. Empty roles can revoke legacy assignments. Caller must still be existing manual admin. No automatic grant UI added.
- Full check passed:353 tests/42 suites, typecheck/lint/production build. All4 affected desktop/mobile browser flows passed, including target eligibility and delayed-save behavior. Independent review APPROVE; reviewer independently ran12 SQL tests.
- Prior custom release b85ce87 pushed/deployed READY dpl_8e4tQoRxRwJB9XuNEd8ZSwnS1aNU and stable testing alias updated. Protected preview health CLI was interrupted; production health200.0015 verified applied,0customrecords, legacyexecute preserved.
- Delegated Q&A (assistant answers, not human evidence): manual admin is distinct from derived exec access; server+SQL reject direct ineligible assignments; saved role state survives reopen and controls cannot diverge during a pending save.
