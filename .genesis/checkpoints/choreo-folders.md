# Choreo folder browsing

## G0 · 2026-10-08
- Existing Choreo adapter, member query, gallery, routes, browser fixtures and docs inspected; current checkpoint/wiki architecture/PLAN/DONE/notes/LOOPS read.
- Verdict PARTIAL: extend existing live Choreo. User reports hosted gallery works; newest-six proposal superseded before completion by folders-first/max-five requirement.
- Scope: Choreo adapter/query/page/loading/player, focused unit/browser tests/fixtures, docs and Genesis records. No migration/environment additions.
- skills considered: coding-orchestrator, agentic-swe-master, modular-architecture, production-readiness, design-system; chose all for private Drive boundary/frontend changes. Project router and design copies canonical. Existing missing optional verify/TDD skill handled with focused behavior tests and fresh independent review.
- Plan: root lists only direct folders; verify folder ancestry; selected folder lists nested folders and five newest videos with signed pagination; explicit route and Suspense loading; membership before Drive; no snapshot/cache; unit security/pagination tests and delayed desktop/mobile browser acceptance.
- Gate commands: npm run check; focused choreo browser suite; format check; fresh-context L4 review. M7 remains pending.

## Iteration 1
- Adapter now browses one selected folder and verifies each ancestor under root. Root reads no videos. Five-video provider pagination, newest first, no accumulation. Signed folder-bound cursors. Parallel current-folder child/video lists; no full-tree traversal.
- Route-specific loading plus keyed Suspense makes Choreo/loading visible while Drive responds. Breadcrumbs, folder cards, next-five/newest links and direct-root-video fallback. Search explicitly applies to loaded page.
- Initial focused unit/query tests19/19 pass, typecheck exit0. Full checks and delayed browser checks pending.

## Verification and exit
- G4: npm run check exit0 (245 tests at that point, typecheck/lint/production build); final nested-ancestor regression brings full suite to246/246 in28 files. Focused Choreo/query20/20. Format check exit0.
- Browser: initial run failed because searching Finale matched the current folder on all five cards; changed test to exact video-name search. Final desktop/mobile2/2 pass, including delayed Google loading feedback and immediate Choreo URL/heading, folders-only landing, five/two/newest page replacement, playback and fresh removal. Desktop/mobile screenshots inspected; responsive fit asserted.
- G5: fresh-context review_choreo_folders APPROVE; independently19/19 tests at review time, no blocking security or pagination findings. Nonblocking nested-depth gap covered by additional test; browser-back freshness remains unverified. Synthetic browser fixtures do not verify live Google latency/playback.
- User-delegated Q+A (prior delegation persists; assistant answers, not human-understanding evidence):
  1. Why sign cursors? Bind Google’s token to this root, folder path and mode.
  2. What if a folder moves outside root? Parent verification fails before listing contents.
  3. How do deletions disappear? Each server read queries Google without a retained listing snapshot.
- Locally complete. Redeploy Vercel code; no migration/new environment variables. User reports previous live gallery works; changed hosted UI/performance not yet verified. M7 remains pending.
