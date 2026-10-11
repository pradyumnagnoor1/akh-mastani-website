# App-wide save/refresh audit · 2026-10-11

## G0 and scope
- Existing app audit, not a rebuild. Read governance/router, current checkpoint, communication/architecture/operations wiki and workflow from preceding debug; source inventory covers every form/server action.
- Master diagnostic: existing production reliability issue; no AI; browser/Next/Supabase/Storage/Google boundaries; admin/dancer privacy and financial records. Phases10/12.
- Skills considered/chosen: coding-orchestrator, master, detective, modular-architecture, production-readiness, design-system. Shared client state boundary and actual network failures matter; retain database authorization and transactions.
- Hypotheses: changing draft UUID across server refresh; new version/old field mismatch or version-key remount on edits; failed-action reset/file loss; partial network save duplication; cleanup/unavailable attachment state.
- Inventory: generated IDs at new announcement/to-do, segment, group, payment batch and featured event. Existing announcement new-draft fix reused. All use optimistic SQL revisions except onboarding/membership and payment batch issuance (UUID uniqueness).
- Freeze: src/components/**, src/features/** action/recovery boundaries, affected editor page keys, tests/**, docs/**, .genesis/checkpoints/**, wiki. No permissions/schema/product-scope changes unless independently reproduced and necessary.
- Plan: reproduce refreshed create IDs and concurrent editor changes; centralize mounted ID/revision; preserve drafts on reject; verify network uncertainty and storage lifecycle. Browser regressions on desktop/mobile plus full unit/SQL, typecheck/lint/build/format and independent fresh-context review. Hosted deploy not performed by this audit.

## Reproduction
- Initial helper awaiting finished streaming RSC response timed out; corrected synchronization to actual response plus cleared refresh indicator.
- Pre-fix3focused browser regressions fail at intended behavior: new segmentUUID changes; announcement editor version1 becomes2 while old draft remains; featured editor remount wipes draft after other-tab revision. No blind fix; source hypotheses confirmed at boundaries.
- Shared mounted draft revision now pairs ID/version with fields; identity-based keys avoid revision remounts, and incoming revision mismatch shows conflict/blocks saving and uploading. All6creation flows use same hook; payment note/deletion drafts included.
- Prevent automatic form resets from clearing draft guards, uncontrolled names, PDF input and confirmations after recoverable failures. Existing SQL transactions/auth/privacy untouched.
- Unrelated user migration0011 edit appeared during this task; preserve it and exclude from audit ownership.

## Broader audit and independent review
- New50-case desktop/mobile save matrix initially48passed/2failed: segment async action forms appear as GET, so dirty polling resumed after rejected saves. Explicit data-mutation-form markers and reset prevention fix it;50matrix+10existing refresh checks then60/60passed.
- Added23 transport-recovery unit cases across all mutation families. Segment metadata preflight transport rejection reproduced an uncaught error before writes; added safe retry recovery. Authorization stays outside recovery catches. Uploaded PDF bytes remain preserved for uncertain commit outcomes.
- Full291unit/SQL tests passed; typecheck/lint/format and production build exit0. Independent reviewer reproduced one P2 member-name refresh gap, initially REJECT. Corrected using captured original name/incoming-name conflict guard, successful own save advances baseline. Two-tab member/rejected-save browser test passes on desktop in full rerun.
- Reviewer revised verdict APPROVE for mounted-refresh scope, conditional on full browser pass. No other blocking findings. Name corrections have no SQL compare-and-set; concurrent unobserved corrections remain last-write-wins. Documented rather than claiming a broader database concurrency guarantee.
- Initial full browser run103passed/4failed/1intentionaldesktopskip: audit segments/featured persisted into existing count/Home assertions and calendar selector matched several All day events. Added test-only afterAll synthetic record cleanup and scoped calendar assertion to workshop; full rerun pending.
- No live publication/deployment or migration changes by this audit. Existing user migration whitespace retained. docs/save-refresh-reliability.md records shared conventions and limits.

## Delegated understanding check
Prior user delegation remains applicable; assistant answers below are not evidence of human understanding.
1. Why capture ID and revision? ID binds uploads and retries to one record; revision binds optimistic concurrency to the exact retained field draft. Fresh revision plus stale fields could bypass protection.
2. Lost committed response? Retained creation UUID is retried; real SQL uniqueness/version constraints reject duplicate records or payment batches. Tests execute SQL before discarding response and verify exactly one saved record/batch.
3. Why payment charge ID keys? Version keys remount and erase notes. Stable identity keys preserve them; captured revision mismatch disables actions and shows conflict until a full reload loads latest state.
- Exact token telemetry unavailable.

## Final verification
- Corrected full team browser suite:109passed,1intentionaldesktopskip, exit0 (2.7minutes); includes52new audit cases across desktop/mobile and all configured team regressions. No remaining failed checks.
- Latest typecheck/lint/format/build exit0 after member correction.291unit/SQL tests previously exit0; no server/SQL changes since that run.
- Public identity/browser suite: initial parallel cold compilation delayed2redirect assertions (26passed/2failed); sequential full rerun28/28passed, exit0 (20.2seconds), without production/test assertion changes. Final combined137browserpasses,1intentionaldesktopskip. Mobile featured calendar screenshot inspected; controls/typography readable with no horizontal overflow. Generated next-env test-directory changes restored to original.
