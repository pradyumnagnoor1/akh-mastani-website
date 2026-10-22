# Repository cleanup · 2026-10-22

## G0 and scope
- User authorized a deep repository audit, removal of unnecessary files and pushing changes. Include the prior reviewed/live notification changes that remain uncommitted.
- PARTIAL: .gitignore/.vercelignore already exclude builds, dependencies and reports. Local disk bloat comes from ignored generated output, not the Git repository. No app-level unused modules/runtime dependencies found.
- Baseline: local directory2.7GiB; tracked335files/3,004,053bytes; Git loose+packed objects3.50MiB and no garbage. Generated .next517MiB, .next-e2e330MiB, .next-e2e-segments1.3GiB, test-results1.2MiB; installed dependencies591MiB.
- Source audit: TypeScript compiler API resolves static imports/exports and literal dynamic imports from53Next entrypoints through all147source modules; every runtime dependency has a direct import. Keep functional source, tests, schema migration history, fonts/licenses and Genesis skill/workflow evidence.
- Confirmed SHA256-identical root IMG_3739.jpeg and served public/team-logo.jpeg. Remove unused root duplicate, update canonical skill reference; preserve original image bytes in public.
- Follow installed Next16.4 docs: generated next-env.d.ts should be ignored; next typegen must precede standalone TypeScript checks. Add fixed-path cleanup script; prevent generated type-file churn.
- skills considered: coding-orchestrator, master, modular-architecture, production-readiness, verify. Chose existing project router/master/modular/production canon and workflow fresh-context review. No frontend visual change.
- No Next/Playwright/Vitest server processes running (process inspection needed sandbox escalation). Scope: generated output, root duplicate/generated type file, ignore/package scripts, README, skill reference and Genesis checkpoint. No dependency/schema/application-behavior changes in cleanup.
- Verification: clean from actual generated paths → npm run check + formatting → affected public/PWA browser checks → independent review → final clean/measure → explicit-file commit and push main → CI/production deployment check. No Git history rewrite or remote database change for cleanup.

## Verification
- Real cold cleanup succeeded. `npm run check` exit0:393tests/43suites, regenerated route types, lint and production build pass. Full `npm run format:check` now passes after removing3stray blank lines in practice-announcements.md; no content change.
- Public browser suite28/28passed desktop/mobile after environment startup recovery. Initial sandbox denied loopback listen; escalated run hit Next's dependency-security advisory; retry exposed obsolete CURRENT 2 (Oct11) in generated Turbopack database. Explicit .next-e2e removal removed corruption; fresh start again displayed advisory once, normal retry then28/28passed. No framework override, app code/dependency change or security-control disabling.
- Next's dev command reports a dependency-security advisory. Separate upgrade recommended; dependency versions unchanged in cleanup.
- Independent reviewer APPROVE, independently checked script syntax/diff and installed Next docs. Fixed8path allowlist anchored to script URL; original logo bytes retained. No functional source/deps/tests/migrations/licenses/workflow removed.
- Existing delegated review Q&A explanations (assistant, not new human acceptance): fixed paths+script-root anchoring prevent working-directory/user-input deletion mistakes; next typegen recreates declarations before tsc; SHA256-identical served logo keeps branding unchanged.
- Fetch origin/main succeeds; local and remote at48bbf6e, no divergence. Final generated-file cleanup, next-env Git index removal and commit/push pending.
- PWA configured browser suite6/6passes desktop/mobile after Next's initial advisory/retry; retained logo/icons/manifest/worker/offlineprivacy/permission behavior verified. Total34affectedbrowserchecks pass.
- Final npm run clean removes regenerated build/type/test output. Measured folder598MiB (591MiB installed dependencies), down from2.7GiB; roughly2.1GiB reclaimed. No generated build/test folders remain. Existing tracked-file bytes2,806,401before adding pending new source/docs; shared project source remains around3MB.
- All checks appropriate to cleanup passed, with startup advisory/cache recovery recorded above. No new tests for the fixed-path housekeeping script; executed against actual generated paths and independently syntax/scope reviewed.
- Release scope: explicit-file commit of notification refinement migration/tests/docs plus reviewed cleanup, excluding credentials/builds/dependencies/deployment-link metadata. Push targetorigin/main; remote baseline fetched and identical. GitHub checks and Vercel commit status provide final publication/deployment evidence.
