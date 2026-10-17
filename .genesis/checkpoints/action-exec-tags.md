# Exec identity on app actions · 2026-10-16

## G0
- Existing author snapshots and attribution component for announcements; task create submits no role, wrapper overwrites trigger role with null, tasks hide author. Existing reusable enum contains all six roles. Existing notifications intentionally omit role tags.
- Verdict PARTIAL: extend existing author attribution to to-do create/edit/list/detail/Home and introduce shared explicit Exec role badge on attribution/roster/admin/calendar/Today. No new data model or retroactive invented historical roles; current stored attribution remains fixed.
- Skills considered/chosen: coding-orchestrator/design-system plus existing security/data invariants. Scope src/components, role-badge surfaces, CSS, focused SQL/browser checks/docs. Existing validation RPC accepts/validates task posting_role and preserves edit attribution; no migration required.
- Acceptance: clearly labelled Exec role badge distinguishes identity from status/audience; assigned role selectable for new tasks as for announcements; saved author role immutable across edits; no notification tags; historical unknown roles remain unknown.
- Checks: full check/build, desktop/mobile published task attribution across list/detail/Home, announcement/calendars unchanged shared component, visual screenshots, independent review.

## Verification
- Shared CommunicationAttribution/ExecRoleBadge applied to announcements/to-do detail/list/Home/Today and calendar notes, with the same badge on Roster/Admin. Task Posting as sends existing validated role to canonical save wrapper; edits preserve snapshots. No migration, permission grant or notification changes.
- Full check passed:355 tests/42 suites/typecheck/lint/production build. Six affected desktop/mobile browser checks passed (task author/save/edit/list/Home plus existing announcement/calendar/read and task-progress flows). Inspected mobile task detail/desktop Home screenshots: explicit EXEC ROLE label and role distinguish it from status/audience; no horizontal overflow.
- Independent review APPROVE;21 focused SQL/digest tests independently passed. Delegated quiz (assistant answers, not human evidence): badges identify sender role rather than task audience; saved roles stay fixed through later edits/member changes; historical unknown roles and notification previews are preserved.
- Deployment: follow current production release workflow; no live synthetic actions or database writes required.

- Production release d0eef02 pushed to main, Vercel dpl_36MxDtMmSjX7UpNpWcVjqM4JLeTr READY and canonical https://akh-mastani.vercel.app aliased. Public health200/statusok and login200/Google sign-in rendering verified. Authenticated visual evidence is local desktop/mobile fixtures; no live posts or notifications created.
