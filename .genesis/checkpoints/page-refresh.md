# Shared page refresh extension · 2026-10-07

## G0 Existence Pre-Flight
- Wiki read: architecture, calendar, index; existing notes/checkpoint show PWA complete locally.
- Source inspection: calendar-only five-minute client poll; no shared refresh or pull gesture. PARTIAL: extend shared root layout and reuse server reads.
- Binding requirements: all pages, professional UI, private active-member authorization, preserved drafts, max10 calendar events and five-minute upstream cache.
- Skills considered: master, router, modular-architecture, design-system, verification. Chose those: client-only interaction; no new backend or migration.
- Scope: root layout/shared refresh component/styles, calendar presentation, focused browser tests/config, documentation/checkpoints.
- Plan: visible/online30sec softrefresh and resume; singlefinger top-only pull circle; protect editing/modal/submitting; consolidate calendar onto server props; browser checks actual cross-account updates, drafts and gestures; type/lint/unit/build; fresh independent review.
- Diagnostic: existing extension, no AI, existing server network/read trust boundaries preserved, frontend phase2.
- G1: project router/design and master/modular loaded; installed Next useRouter guide read. Blueprint/TDD optional packages absent from searched support directory; microplan and behavior-first browser acceptance are local equivalents.
- User already delegated workflow decision/quiz answers; preserve that authorization.

## BUILD / VERIFY exit
- G2: shared global controller, calendar poll consolidation, explicit pending marker, five behavior scenarios run in both layouts (10 new browser cases).
- Debug evidence: initial timer test installed clock after timers were created; installing before navigation proved the actual30second update. Search followup waited for response rather than React transition completion, so a second pull was correctly suppressed; now waits for spinner removal. Transient quote typo corrected before final checks.
- G4: typecheck0, lint0, formatcheck0, build0; npm test204/204; focusedrefresh10/10; fullconfigured36/36 andpublic22/22 browserflows pass. git diff --check0.
- G5: fresh-context /root/review_refresh initially REJECT for submitted GET search dirty-state and broad disabled-button pending detection. Fixed by treating GET filters separately and using data-refresh-busy derived from useFormStatus. Re-review APPROVE; source/test review preserved auth,10eventcap andfive-minuteupstreamcache.
- Visual: desktop pull-circle screenshot inspected; mobile layout covered by screenshots/browser runs. Physical Safari/HomeScreen gesture acceptance remains pending deployment.
- Budget: within10iterations; exact token telemetry unavailable, no synthetic count claimed.

## Delegated workflow Q+A
Previously authorized assistant-selected answers, not a claim of human comprehension.
1. Why router.refresh? It rereads authenticated server data and merges it without a whole-page reload, preserving unaffected client state/scroll.
2. Unsaved edit or pending request? Refresh pauses for edits/focus/dialog/submitting; concurrent triggers are ignored until current transition completes. No form mutation is retried.
3. Thirtyseconds vs five-minute calendar? Page reads share the existing server adapter. Its300second cache/lease/cooldown controls Google calls regardless of root refresh cadence.

Local extension complete. No deployment, credentials change or migration required by this change; user deploys updated code to Vercel and checks physical iPhone pull. M7 hosted acceptance remains outstanding.
