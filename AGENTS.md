# AKH Mastani website

## Workflow and skill entrypoints

Use the user's agentic-swe-master / Genesis workflow. Preserve the latest user requirements over examples and template defaults.

Project-maintained skills (read the files when applicable):
- Router: [coding-orchestrator](skills/coding-orchestrator/SKILL.md)
- Frontend: [design-system](skills/design-system/SKILL.md)

The project copies are the source of truth for these two skills. Global copies, if installed, are distribution copies. Use these project paths when working in this repository.

Existing workflow sources on the user's machine:
- `/Users/prady/Desktop/agentic-swe-kit/skills/orchestrator/agentic-swe-master/SKILL.md`
- `/Users/prady/Desktop/Projects/genesis-kit/` (templates and tooling)
- `/Users/prady/Desktop/skills-directory/skills/` (supporting skills)

If a `.genesis/` spine has been initialized, follow its read order and resume from its current checkpoint. Do not treat the existence of these new skills as completed project initialization or a completed application milestone.

## Product invariants

- All members are dancers. Admin access is an additional permission, manually assigned by the user. The user is the only initial admin; obtain their verified account identity during auth setup.
- Google sign-in requires the exact TAMU email domain and the agreed membership approval policy. Link records using permanent member IDs; ask for the display name once.
- Pages: Home, Announcements, To-Dos, Practice Calendar, Set Design, Payments, Roster, Choreo, Admin. No Attendance yet; no Benching, Dues, or Reimbursements.
- Segments contain a name, formation PDF, and member assignments; roster segments derive from those assignments.
- Payment reports require admin verification before clearing outstanding balances; preserve history for existing records. Explicit admin deletion permanently removes non-payment items and their related history, assignments and notification jobs across all pages; no archive or restore views. Deleted payments and their history are retained privately in the database, hidden from all app pages and exports.
- Choreo dynamically lists Google Drive team dance videos; Google retains video hosting and access permissions.
- Hosting target is Vercel; planned application stack is Next.js/TypeScript and Supabase. Calendar schedules originate in the existing team Google Calendar.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
