# Navigation feedback and clickable announcement links

## G0 · 2026-10-16
- Wiki read: index, calendar; existing navigation checkpoint and communication source inspected.
- Existing route loading and NavigationHint cover route fallback/main nav; other links lack pending feedback. Announcement bodies render as plain text. Verdict: PARTIAL.
- Scope: shared navigation link, existing Link imports, message link parsing/rendering, styles, focused tests, docs and checkpoint.
- Outcome: all app page links including back/cancel/query navigation show framework-owned pending feedback; HTTP(S)/www announcement URLs become safe, visibly clickable links.
- Skills considered: coding-orchestrator, agentic-swe-master, modular-architecture, design-system. Chose these for existing frontend extension; no backend changes.
- Diagnostic: existing conventional app, no AI; existing network/auth boundaries unchanged; frontend implementation phase.
- Verification: npm run check; focused navigation/communication browser tests; independent fresh-context review.
- Exec workspaces deferred by user. Earlier roles/practice/calendar proposals remain unimplemented.

## Verification
- npm run check exit 0: typecheck, lint, 335 unit/SQL tests in 39 suites and production build.
- Focused desktop/mobile browser suite: 11 passed, 1 intentional desktop-only skip. Covers delayed main navigation, create/cancel/back/filter transitions, cleared loading state, narrow layouts, menu focus/draft retention and clickable announcement URLs.
- Mobile loading and announcement screenshots inspected: notice remains visible above scrolled content; links underlined, wrap within panel.
- Final typecheck/lint/format checks passed after recovery-link correction.
- Fresh-context reviewer initially identified plain error recovery anchor; corrected to AppLink. Reviewer APPROVE with no remaining blocking findings; independently ran 3 parser tests.
- Persistent user delegation of workflow quiz recorded in prior navigation-feedback checkpoint applies (assistant answers, not human evidence): (1) framework-owned pending clears with completion/supersession, (2) invalid/unsafe schemes remain text while valid HTTP(S) opens separately, (3) shared link wrapper changes feedback without changing permissions or database state.
- Direct click/new-tab desktop/mobile replay passed 2/2 with intercepted external destination, confirming actual link activation. One attempt was blocked by sandbox local-port permissions; approved-prefix rerun succeeded.
- Local change only; redeploy and physical-phone acceptance remain separate. No database migration or environment additions.
