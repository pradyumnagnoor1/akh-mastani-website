# Permanent deletion and Choreo

## G0 Existence Pre-Flight · 2026-10-08
- Read current checkpoint, DONE/PLAN, notification/architecture/operations wiki and implementation notes. Existing app and CRUD reused.
- PARTIAL: delete buttons currently archive communications, groups, segments, featured events and payment charges; admins retain archive/restore/history access. Announcements empty heading incorrectly says No open to-dos.
- UNBUILT: Choreo navigation/page and dynamic Google Drive video listing.
- Latest user instruction authorizes permanent deletion across the app and a new Choreo page, superseding prior delete-retains-history behavior. Optional payment exception and Drive folder/access clarification requested; continue independent work.
- Skills considered: [coding-orchestrator, design-system, agentic-swe-master, modular-architecture, production-readiness, security-engineering, data-systems-engineering]; chose these for existing backend/UI, data deletion and external-file boundary.
- Scope: src/**, new migration0009, affected tests/fixtures/configuration, docs and Genesis progress/governance. No live provider deletion, deployment, credential rotation or Drive permission changes.
- Plan: fix empty state; add admin/version-checked hard-delete operations, dependent record/outbox purge and reliable formation-object cleanup; purge prior archived/deleted records on migration; remove archive/restore UI; build protected Choreo with live Drive listing, Google-hosted video playback, bounded server-only credentials and honest setup/error/empty states; verify SQL permission/cleanup behavior, adapter failures, browser cross-page deletion and responsive Choreo; independent L4 review.
- Acceptance: deleted records cannot appear in lists, details, roster, Home, exports or notifications; related audits/assignments/recipients removed. Membership deactivation and settled-payment verification remain distinct from deletion. Drive content is read-only and never copied into app database/offline cache.
- Commands: npm run check, affected format check, npm run test:e2e:team with affected flows. M7 live setup remains separate.

## Iteration1 — BUILD
- G1: required available skills loaded; new Next work uses installed Next docs. Existing TDD/planning/verify skill files absent in documented locations; behavior-driven tests and fresh independent review provide equivalent checks.

## User clarification · 2026-10-08
- Folder supplied:15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ, restricted to TAMU accounts. Wired as default and direct-link fallback. Added server-only owner OAuth refresh grant support because ordinary Google app sign-in cannot grant server Drive access. Credentials still absent; no permissions changed.
- User explicitly chose Keep payment history; hide deleted payments from the app. This supersedes initial provisional all-hard-delete implementation: migration0009 preserves payment charges/batches/audits privately, hides them through RLS and suppresses/purges every deleted-charge push job. Other deleted entities physically removed.

## Iteration2 — VERIFY and review fixes
- G2: no archive/restore UI; correct announcement empty state; new Choreo page/nav/filter/player + server-only Drive adapter; migration0009 and durable PDF cleanup;24 new/affected focused SQL/adapter/cleanup tests.
- G4: npm run check exit0:232 tests/27 files, typecheck/lint/build passed.18 affected desktop/mobile browser flows exit0. Initial browser failures were stale Archive expectation and login URL query assertion, corrected with direct removed-item checks.
- Independent review identified detached audience edits and malformed folder fallback. Fixed selected-audience normalization + version increment and regression edit test; parse folder only inside guarded queries.
- PDF cleanup uses per-object transaction locks and rejects missing/queued keys to fence concurrent reattachments.
- External setup: apply0009 then redeploy; configure cleanup retry cron, server secret and read-only TAMU Drive OAuth credentials. Real playback and hosted deletion not verified. No public sharing, deployment or live mutation performed.

## G5 Independent L4
- Fresh-context reviewer review_deletion_choreo initially REJECTED detached-post edit and malformed-folder fallback. Both corrected; one review retry APPROVE. Final follow-up confirms metadata-only scope alignment, query boundary tests, legacy migration coverage and44px mobile nav. Reviewer independently ran28/28 focused tests.
- Full configured browser suite:51 passed,1 intended desktop skip,2 failures. Resolved test isolation for empty announcements and actual extra-page mobile-menu clipping; final9 navigation/Choreo/empty flows pass,1 intended skip. Thus53 distinct configured flows pass across recorded runs.320px fit and mobile focus/draft behavior included. Desktop/mobile Choreo gallery/empty and mobile drawer visually inspected.
- Latest npm run check after query recovery changes:235 tests/28 suites, typecheck/lint/build exit0; added legacy-upgrade SQL test then26 focused SQL/Drive/query tests exit0. Final full check below records the final count. Format check exit0; final added test formatting checked again.
- Verify/requesting-code-review named skills absent; manual fresh-context review performed, not falsely claimed loaded. G3 exact token telemetry unavailable; no fabricated count.

## User-delegated Q+A
Prior quiz delegation recorded in push-notifications.md persists. These are assistant answers, not evidence of human understanding.
1. Why retain deleted payments/history privately while permanently removing other items/history? User explicitly chose the financial exception; preserve verification/audit evidence in the owner database while RLS hides it from every app role and export. Other items cascade-delete by latest requirement.
2. What if Storage deletion succeeds but cleanup acknowledgment fails? The durable key remains; subsequent cleanup safely retries deletion of an already-absent object, then acknowledges it. App/Storage reads are already revoked; no deleted PDF becomes visible.
3. Why change surviving posts to selected and increment their version when deleting a source? Captured recipient UUIDs/completion progress remain valid, the removed group/segment cannot be referenced, selected audiences remain editable, and version fencing rejects stale source forms.

## Final computed checks · 2026-10-08
- npm run check exit0:236 tests across28 suites; typecheck, lint and optimized production build passed.
- npm run format:check exit0, all matched files formatted.
- Final Choreo desktop/mobile browser screenshots replay:2/2 passed; gallery and scroll-reset empty state inspected. Earlier final navigation/empty suite9/9 pass with1 intended desktop skip;53 distinct configured browser flows pass across regression/fix runs.
- G5 fresh-context independent APPROVE remains valid for final artifacts;28 focused tests independently rerun. Delegated Q+A logged. Local extension complete; live Google OAuth credentials, migration0009, cleanup scheduler/deployment and hosted playback/deletion acceptance remain external setup, not claimed complete.
