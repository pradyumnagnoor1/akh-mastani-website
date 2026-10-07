# Integration and operations
Member profiles at /roster/[id] reuse permanent IDs and segment assignments. Self/admin can see private assigned communication and payments; other dancers get directory/segment information only. AdminSummary is additional to personal Home.

/api/admin/export requires current admin and session RLS, explicitly allowlists operational columns, reads stable pages, rejects partial/error and caps3MB data/20k rows per table. Includes payment audit, excludes other audits/Auth/PDF bytes/credentials; not a consistent recovery backup. /api/health is liveness only with no dependencies/secret data. CI runs full check/public/team browser suites.

Deployment, backup+Storage bytes, isolated restore drill, incident/rotation/annual handover runbooks are docs/deployment.md and docs/operations.md. No installed backup automation or live restore claimed. M7 must provision services and demonstrate hosted two-account authorization, Storage operation restrictions, real Calendar and restoration.
