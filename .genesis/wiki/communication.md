# Announcements and to-dos

Implemented locally in `src/features/communication`, shared communication components, `/announcements`, `/todos`, `/admin/groups`, and migration 0003. Milestone review state is in CURRENT.

Only active admins publish/manage. Every admin retains ordinary dancer participation. `communication_posts` stores content/type/mode/audience source label/version; `communication_recipients` stores immutable UUID snapshots and individual completion. Group/segment/team audiences resolve to active dancers at creation. Saved groups are reusable audience sources, not additional team roles.

Active recipients see targeted posts and only their own recipient row. Admins see all progress and archive history. Announcements acknowledge per person; individual to-dos complete independently; shared to-dos update one actor/timestamp with idempotent first-completion behavior. Admin reopen bumps version so stale completion forms cannot redo it. Edits preserve target and mode. Audit records append through definer RPCs, direct application writes denied.

Home filters by actual assignments even for admins. Explicit personal vs All team views distinguish dancer participation from management. Lists page through provider row caps; source queries/SSR use the member session, not a service-role client. Real OAuth/hosted checks remain M7.


User CRUD refinement: archive operations are exposed as Delete announcement/Delete to-do with confirmation and a Deleted tab; restore/history semantics and capturedrecipients preserved. Groups similarly use Delete group; no permanent deletion of historical assignments.
