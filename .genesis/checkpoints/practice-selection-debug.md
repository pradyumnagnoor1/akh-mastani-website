# Practice selection debug · 2026-10-23

## G0 / L2
Existing implementation reused: communication actions/form, calendarData, SQL practice_schedule and save_announcement. Read calendar/communication wiki, latest checkpoint and implementation notes. Scope: save action, focused action/SQL tests, checkpoint. Outcome: long-lived drafts refresh the trusted Google snapshot before practice validation; deleted/reconnected practices remain rejected. Verify: focused tests, npm run check, independent L4 review.

Skills considered: coding-orchestrator, agentic-swe-master, detective, modular-architecture, production-readiness; chose all for incident at calendar/DB boundary. No AI; existing authenticated app with Google and Supabase boundaries.

Symptom: IMG_0786 shows “Practice unavailable. Refresh the calendar and choose a practice” on publication.
Hypotheses: stale snapshot (high); incorrect occurrence/source identity (medium); missing migration (low). UI and SQL occurrence identities/source fingerprints agree; exact error proves save wrapper exists. SQL schedule excludes snapshots older than 15 minutes, while form retains choices indefinitely and save never refreshes calendar. Reproduce by aging snapshot, then refresh same snapshot and retry. Fix refresh through existing bounded, source-validated adapter before Google-linked saves. Never replace submitted identity/source or weaken SQL freshness rules.

## Verification
- SQL reproduction confirms the same selected event fails after 16-minute snapshot age and succeeds after trusted snapshot freshness is restored.
- Action regression proves refresh precedes publication, preserves source/identity, retains draft on exception, and bypasses Google for custom/ordinary posts.
- Initial full check identified a missing mock for the new dependency in mutation-recovery; corrected. Final `npm run check` exit0:397 tests/43 suites, typecheck, lint, production build. Focused Prettier and git diff checks exit0.
- Independent fresh-context verify_practice_fix: APPROVE, no blocking findings; independently ran55 tests covering actions, SQL, calendar queries and mutation recovery.
- Delegated Q+A consistent with prior checkpoint: Design—refresh at publication because retained drafts outlive SQL freshness. Edge—reconnect/deletion remains rejected by unchanged submitted source/identity validation. Impact—custom and ordinary saves bypass Google; no migration.
- Local repair complete. No live authenticated reproduction or deployment performed; screenshot itself cannot establish the live snapshot age. This fixes the reproduced stale-snapshot path matching the reported error. Deploy code to activate.
