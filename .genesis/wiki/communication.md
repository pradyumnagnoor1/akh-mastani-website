# Announcements and to-dos

Implemented locally in `src/features/communication`, shared communication components, `/announcements`, `/todos`, `/admin/groups`, and migration 0003. Milestone review state is in CURRENT.

Only active admins publish/manage. Every admin retains ordinary dancer participation. `communication_posts` stores content/type/mode/audience source label/version; `communication_recipients` stores immutable UUID snapshots and individual completion. Group/segment/team audiences resolve to active dancers at creation. Saved groups are reusable audience sources, not additional team roles.

Active recipients see targeted posts and only their own recipient row. Admins see all live progress. Announcements acknowledge per person; individual to-dos complete independently; shared to-dos update one actor/timestamp with idempotent first-completion behavior. Admin reopen bumps version so stale completion forms cannot redo it. Edits preserve target and mode. Audit records append through definer RPCs, direct application writes denied.

Home filters by actual assignments even for admins. Explicit personal vs All team views distinguish dancer participation from management. Lists page through provider row caps; source queries/SSR use the member session, not a service-role client. Real OAuth/hosted checks remain M7.


Latest user requirement: migration0009 permanently deletes posts/groups and their dependent recipients/assignments/audits/jobs. No Deleted tab or restore. Group/segment deletion detaches live posts to Selected dancers with preserved captured recipients and a new version so subsequent edits work and stale forms fail. Empty announcements say No announcements.

Announcement and to-do messages render HTTP(S) and www URLs as underlined violet links on lists and details; reminder messages use the same renderer. Links open a new tab with noopener/noreferrer. Content remains plain text (no HTML rendering); surrounding punctuation is preserved, long URLs wrap, and www addresses use HTTPS. No data migration is needed; existing posts benefit on render.

Migration0014 extends publishing to every exec (all exec roles now have full management, superseding the own-post-only proposal). Save through save_announcement; lower save RPCs are internal. Original author name/selected role/time persist, edited_at tracks content changes, unread/read badges use red/green. Practice links store source fingerprint and stable occurrence identity plus last-known snapshot; calendar notes query the same authorized posts. Linked records never retain separate author reminder fields. See docs/practice-announcements.md.

Testing rollout compatibility amendment: old save RPCs retain their authenticated grants so current production continues working against the shared database. The insert trigger stamps old-client author name and first assigned role; new save_announcement validates explicit role choices. Earlier lower-RPC-private note is superseded.
