# Today card refinements · 2026-10-12
## G0 Existence Pre-Flight
- Existing digest policy/card/query and communication list/detail inspected; notifications wiki and digest docs read. BUILT, refine existing behavior.
- Symptoms: user reports missing incomplete assignment, read announcements present, dislikes Daily Plan label and formation entries.
- Suspects: deadline filter (high), saved read-state mismatch (medium), refresh/assignment mismatch (medium). Policy excludes future/no-deadline tasks; shared announcements use recipient state unlike list/detail global completion state. Individual acknowledgment already correctly filters. Live account state not inspected.
- Skills considered: router, master, detective, design-system, modular-architecture. Chose these for UI/policy repair; no database or notification dispatch changes.
- Scope: digest policy/card, unit and browser regressions, digest docs/wiki/checkpoints. Keep authorized recipients, expiry, payment verification, quiet scheduling unchanged.
- Acceptance: Today heading only; no formation entries; all incomplete assigned tasks included ahead of unread announcements; shared/individual status matches detail page; five-item expand retained.
- Checks: npm test, npm run typecheck, affected lint, digest desktop/mobile browser tests; independent L4 review.

## Verification
- G4: 330 tests/38 suites pass; typecheck and affected lint exit0; four desktop/mobile digest E2E checks pass. Desktop/mobile screenshots inspected, no horizontal overflow.
- G5: fresh-context verify_digest_refinements APPROVE; focused 7/7 policy tests independently passed. Reviewer reports verify/requesting-code-review specialist unavailable; performed independent source/test review using master/router.
- Delegated quiz (existing user authorization; assistant answers, not human understanding evidence):
  1. Why future/undated tasks before announcements? An incomplete assignment remains actionable regardless of deadline; urgent work still leads.
  2. Shared announcement globally read but recipient incomplete? Hidden, matching the detail/list global shared completion state.
  3. Task due2099 and formation update with >5 entries? Task appears in expandable prioritized list; formation update never appears in Today.
- Live account's two announcement states were not inspected. Individually acknowledged items already suppress; opening alone does not save read status. No migration or nudge activation needed.

## Preview release
- Commit eadfbd7 pushed to origin/preview; Vercel dpl_5f16pQqiGpatdLGjJvf8ATayJLgW Ready, target Preview, build28s. Stable Preview alias now points to this build. Production main and nudge controls unchanged.

## Action-oriented digest refinement
- G0: reuse TodayCard/style; existing Home communication panels stay unchanged.
- Skills considered/chosen: master, router, design-system, modular-architecture; visual-only change.
- Scope: Today labels and styled action links, existing browser assertions/screenshots, docs/checkpoint.
- Acceptance: complete/read verbs, differentiated task/announcement icons and tinted inset cards, no inline completion or read mutation, preserve expiry/privacy and five-item behavior.

- Action UI verification: 330 tests pass, typecheck/lint clean,4 digest browser checks plus2 populated screenshot replays pass. Desktop announcement/mobile task screenshots inspected; no horizontal overflow.
- Fresh-context verify_digest_actions APPROVE; reviewed source and mobile screenshot. Nonblocking destination-prefix style mapping must extend for future item types.
- Delegated Q+A (assistant answers under prior authorization, not human-understanding evidence): distinct inset/action cards make next steps clear while lower panels summarize records; Complete to-do opens detail and leaving does not complete; Read announcement opens detail and only saved Mark as read suppresses the item.

- Action cards released: commit9e244db on origin/preview, Ready deployment dpl_GEq4Y2VHQngSY6s52LtzNB1ztMBc/build27s, stable alias assigned. Production unchanged.
