# Mobile interface extension

## G0 Existence Pre-Flight · 2026-10-08
- Wiki read: index, architecture, identity, operations, design contract; rolling notes searched for frontend/navigation.
- Existing: shared AppShell, modal drawer, logo Brand, all eight pages and private data workflows. Brand is not linked; no mobile tabs; selected navigation matches exact routes only. Verdict: PARTIAL — extend existing presentation.
- Diagnostic: conventional existing application, phase 2 frontend; no new AI/network/trust boundaries. Keep Next/Supabase/Vercel and all product invariants.
- Skills considered: coding-orchestrator, design-system, modular-architecture, production-readiness. Chose first three plus agentic-swe-master; presentation only, no backend changes.

## L1 BUILD scope and criteria
- Authorized freeze: src/app/layout.tsx, fonts, globals.css, Home, shared presentation components; browser navigation checks/config, design reference, docs and Genesis progress. No schema/env/auth/data changes.
- Mobile: direct Home/To-Dos/Calendar/Updates tabs, More opens full accessible menu, readable text and 44px controls, safe-area/content clearance. Desktop sidebar remains. Logo/text opens Home; nested pages retain section selection.
- Preserve form drafts, modal focus/Escape behavior, refresh gesture, role-based views, private payments, notification consent and calendar limits. Subtle tonal depth and restrained transitions, no decorative copy.
- Demo: npm run check; format:check; configured and public desktop/mobile browser suites. Inspect screenshots at phone/desktop widths and 320px overflow.
- L4 independent fresh-context review required, then delegated Q+A per existing user authorization. Hosted physical-iPhone validation remains separate.

## Progress
- G0/G1 recorded; installed Next font/link guides read. Bundling licensed Hanken Grotesk and Barlow Condensed locally; no runtime Google-font dependency.

## Verification evidence
- G2: Shared UI extended without data/auth/schema changes; new navigation interaction checks. G3: bounded iteration, exact token telemetry unavailable.
- Optional named writing-plans/TDD/requesting-code-review files were not found in configured kit/global/supporting directories; equivalent capabilities supplied by this bounded plan, browser behavior checks and fresh-context review-agent skill. No claim that unavailable files were loaded.
- Initial npm run check exit0: 212 unit/SQL tests, lint/typecheck/build. Full suites exit0: 49 configured desktop/mobile flows plus28 public flows; one intentional desktop-only skip. Narrow320px and desktop/mobile populated screenshots inspected.
- Visual follow-up: avoid Search button word splitting, improve secondary-button outline (3.08:1 against raised surface), separate adjacent Home panels and fit all drawer entries at390x844. Normal text16.69:1 and muted9.08:1 against surface; primary button text6.85:1; input outline3.45:1.
- Initial independent reviewer /root/review_mobile_ui: APPROVE, no findings. Bounded final CSS review and focused browser/quality rerun pending.

## L2 DEBUG · drawer keyboard check
- Skill: detective, read from Desktop/skills-directory; parent BUILD checkpointed.
- Symptom: new Sign out → single Tab → brand assertion fails on mobile Chrome. Existing modal close/Escape and Admin viewport checks pass.
- Suspects: browser-chrome focus step (high); scroll-container focus stop (medium); application focus leaking outside native modal (low).
- Discriminating test: log only active-element tag/accessible label/modal containment after successive Tab and Shift+Tab; no secrets/member data. Do not add application focus handlers until behavior is established.
- Final review gate temporarily REJECT due to unresolved test, no CSS defect found.
- Diagnostic result: first Tab after Sign out reports BODY with modal still open; next Tab reports brand link inside modal. Shift+Tab from brand reports Sign out immediately. No background app control receives focus. Cause: native Chrome browser-chrome step, not an application focus leak.
- Fix: regression test permits that specific BODY boundary step and still requires wrapping to brand and back to Sign out. Removed temporary diagnostics; native modal implementation unchanged. Surrounding focused checks rerunning.

## L4 exit and delegated Q+A
- Final npm run check exit0: 212 unit/SQL tests, typecheck/lint/build. Format check exit0. Focused final navigation+roster refresh run exit0: 7 passed,1 intentional desktop skip. Full regression earlier:49 team+28 public flows. Final screenshots inspected; Search label, complete Admin menu entry and separate Home panels corrected.
- Fresh-context independent reviewer /root/review_mobile_ui final APPROVE, no findings; intermediate REJECT resolved with measured native-browser Tab behavior.
- User previously delegated implementation choices/answers. These answers are assistant-selected, not a claim of a human comprehension check.
  1. Why quick tabs plus drawer on mobile and sidebar on desktop? Tabs place frequent tasks within thumb reach; drawer retains all pages/account without crowding a small screen. Sidebar exposes the full menu where space permits.
  2. More on nested Payments: what does Escape do and which item stays selected? It closes the modal and restores More; Payments stays selected in the drawer and More indicates the secondary section in the bottom bar.
  3. Why separate admin personal balance/role from management summary? Every admin remains a dancer with their own private assignments/charges. Extra management permission does not merge another member's balance or replace personal participation.
- Extension locally complete. No deployment performed; no new env/schema setup. Physical Safari/Home Screen keyboard, insets and touch acceptance remains a hosted check; existing M7 setup/restore gates are unchanged.
