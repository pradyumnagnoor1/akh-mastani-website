# Publik-inspired UI refresh
## G0 · 2026-11-03
PARTIAL: existing dark/purple tokens, cards, navigation, Today digest and Budget controls extended. Project router/design and existing Genesis workflow apply. User requests stronger greeting, floating sidebar, layered cards, typography, consistent filters/dropdowns, funds-first Budget and compact requests. No data or permission changes. CSS customizable native selects style field and menu where supported; native semantic/mobile fallback retained. Existing short request form and collapsed optional details reused.
## Verification
Typecheck/lint/unit/build, desktop/mobile Budget forms/dropdowns and navigation/digest browser checks; independent L4 review required. No migration.
## Results
Independent L4 APPROVE.463tests/typecheck/lint/build pass. Budget desktop/mobile pass. Digest/navigation12pass plus dropdown2pass and corrected mobile menu1pass (desktop skip intentional). Screenshots inspected: desktop Home and dropdown popup, mobile request form. Updated stale Home heading test expectations to primary heading. Mobile drawer spacing adjusted after viewport check. No migration/API changes.
