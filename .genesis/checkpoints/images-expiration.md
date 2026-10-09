# Announcement images and automatic expiration

## G0 · 2026-10-09
- Existing approved plan: docs/announcement-images-expiration-plan.md; user authorized implementation. Preflight found existing admin communication/featured forms and RPCs, permanent deletion0009, private formation cleanup and authenticated maintenance, but no announcement images or expiration. Verdict PARTIAL: extend existing features, preserve payments and Google Calendar source behavior.
- Scope: migration0010 and separate Cron setup, private image preparation/actions/read/cleanup, communication/featured expiration forms and visibility, exports, existing maintenance, tests, rollout docs and checkpoints. No publishing permission expansion or production migration/deployment.
- skills considered: project coding-orchestrator/design-system, modular-architecture, production-readiness, data-systems-engineering. Chose project router/design and database foundation with existing master workflow for transactional private uploads and expiry.
- G1: Project skills and applicable foundation read; approved implementation plan served as behavior/acceptance boundary. Build reuses existing modules rather than introducing a second posting workflow.

## Implementation
- One optional private image per announcement: native picker, compression before transfer, preview/replace/remove, optional description and enlarge dialog. Actual JPEG decode/re-encode strips metadata;1MB hard object bound,1600px long edge. Source20MB/20MP checked before decode. JPEG/PNG/WebP supported; HEIF rejected with actionable guidance because tiled primary dimensions cannot safely be inferred from the first property.
- Admin-only server upload uses service credentials after member authentication and database reservation. Browser Storage INSERT denied. Immutable validated reservation and atomic version-checked save; recipient/admin image reads use nonexpired post visibility.
- Optional Chicago end-of-day expiration for announcement/to-do/custom featured forms. RLS hides all expired records, even from admins and exports, before purge. Mounted content/details/editors hide at cutoff; old requests cannot mutate expired rows. Featured expiration-only edit increments revision and audits the change.
- SQL bounded200+200 purge cascades histories/recipients/jobs. Storage API cleanup retries,40 keys perbatch; abandoned upload quarantine2minutes, stale draft1hour. Private key-only cleanup evidence reconciles hourly for one day to catch late upload writes, then disappears.
- Five-minute Supabase SQL purge; existing five-minute maintenance removes Storage bytes. Application cron history trimmed daily to7days. No paid transforms/Vercel frequent cron requirement. Account quota and paused-project delays remain external limits.

## G4 verification
- npm run check exit0: typecheck, lint with no warnings,260 tests/31 files, optimized build. Subsequent notification-expiry test added; final npm test exit0:261 tests/31 files. Final typecheck/lint/format exit0. Runtime npm audit --omit=dev exit0: zero vulnerabilities.
- Image/expiry SQL suite10cases, realJPEG/dimension tests3, cleanup tests2: pass. Enforce private selected-audience reads, fake/unverified uploads, stale/expired mutations, replacement/deletion and histories, Chicago DST, expiration-only feature revision, late-write cleanup evidence, notification validity/enqueue suppression/cascade, failed Storage retry and metadata stripping.
- Configured browser18communication/management checks pass;17operations/Choreo/navigation/segments regressions pass,1intentional desktop mobile-menu skip. Final2desktop/mobile image flow replays also pass including enlarge/close.35distinct passing browser cases across runs, plus2replays. Mobile/desktop image screenshots inspected: responsive image and actionable controls fit existing UI.
- Local fixture loads complete migrations0001–0010 and enforces actual database RLS. No hosted database, storage quota, real Photos/Files picker, Cron health or physical iPhone acceptance claimed.

## G5 independent review and delegated quiz
- Fresh reviewer review_images_expiration initially REJECTED expiration-only event version and late upload cleanup race. Fixed and added regressions. Next review found HEIF tile predecode ambiguity; conservative rejection plus tile/oversized fixture fixed it.
- Final independent APPROVE, independently ran3files/15tests; reviewed rollout and named Cron setup. No remaining blocking finding.
- Prior user-delegated quiz persists; assistant answers are not human-understanding evidence:
  1. October9 date disappears October10 midnight America/Chicago, converted toUTC with DST.
  2. Private cleanup keys reconcile late provider writes hourly for aday; cannot restore images.
  3. HEIC tile dimensions can understate rendered memory, so unsupported input is rejected before decode.
  4. Expiry-only edits advance versions to reject stale editors.
  5. SQL purge deletes records, not actual image bytes; authenticated maintenance uses Storage API and retries.

## Exit and next action
Locally complete. Apply0010 once after0009, install Supabase SQL expiry/log schedules, maintain Vault-authenticated file cleanup schedule and server-only keys, redeploy. Follow docs/announcement-images-expiration.md for live activation and phone/two-account checks. M7 production activation remains pending. No .genesis/PLAN.md or DONE.html changes.
