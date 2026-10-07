# Segments and private formations

M2 implementation: `src/features/segments/`, `src/components/segment-form.tsx`, `/segments` routes and migration `0002_segments.sql`. Independent review and user quiz status live in checkpoints.

`segments` stores name, immutable PDF key, optimistic version and archive timestamp. `segment_members` is the single assignment source consumed by segment lineup, Home and Roster. Admin permission does not remove dancer participation. RPC saves serialize segment edits and lock selected active members before validating assignments; stale versions fail without overwriting. Archive preserves records.

Private Storage INSERT is admin-only; SELECT requires an active member AND `storage.allow_only_operation('object.get_authenticated')`. Other operations, including single/batch signing, fail closed. Dancers read only current PDFs on active segments. `/segments/[id]/document` downloads using the member session and serves private/no-store content; same-origin embedding and open/download fallback. Replaced files stay private for audit history. Limit 4 MiB with 5mb server-action envelope.

Sources: [operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Local PGlite tests stub the documented helper contract; hosted Storage context and real PDF delivery remain mandatory M7 checks. No service-role key is required.
