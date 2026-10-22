import { ExecRoleBadge } from "@/components/exec-role-badge";
import { AdminSummary } from "@/components/admin-summary";
import Link from "@/components/app-link";
import { requireAdmin } from "@/features/identity/session";
import { MemberControls, ExecRoleControls } from "@/components/forms";
import type { Member } from "@/features/identity/policy";
export default async function Admin() {
  const { supabase, member } = await requireAdmin();
  const { data, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin,exec_roles")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load membership requests.");
  const people = data as Member[];
  const pending = people.filter((p) => p.status === "pending");
  return (
    <>
      <div className="page-heading">
        <h1>Team management</h1>
        <p className="muted">Manage membership and team information.</p>
      </div>
      <AdminSummary />
      {pending.length > 0 && (
        <div className="notice">
          <strong>
            {pending.length} membership{" "}
            {pending.length === 1 ? "request" : "requests"} awaiting review
          </strong>
          <p>
            Confirm each person belongs to the team before approving access.
          </p>
        </div>
      )}
      <h2 className="section-label">Manage</h2>
      <div className="admin-link-list">
        <Link href="/announcements?view=all" className="admin-shortcut">
          Announcements <span>Publish and review acknowledgment</span>
        </Link>
        <Link href="/todos?view=all" className="admin-shortcut">
          To-dos <span>Assign action items and track progress</span>
        </Link>
        <Link href="/payments?view=reported" className="admin-shortcut">
          Payments <span>Verify reports and manage charges</span>
        </Link>
        <Link href="/segments" className="admin-shortcut">
          Set design <span>Segments, formation PDFs and lineups</span>
        </Link>
        <Link href="/admin/groups" className="admin-shortcut">
          Groups <span>Reusable dancer groups for targeting</span>
        </Link>
        <Link href="/admin/calendar" className="admin-shortcut">
          Google Calendar{" "}
          <span>Connect or reconnect the practice calendar</span>
        </Link>
        <Link href="/choreo" className="admin-shortcut">
          Choreo <span>Team dance videos in Google Drive</span>
        </Link>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <h2>
            Members & requests <span className="count">{people.length}</span>
          </h2>
        </div>
        {people.map((person) => (
          <article key={person.id} className="admin-member">
            <div className="panel-title">
              <div>
                <h3>{person.display_name ?? "Name not completed"}</h3>
                <p className="muted small">{person.email}</p>
              </div>
              <span
                className={`badge ${person.status === "active" ? "success" : ""}`}
              >
                {person.status}
              </span>
              {person.is_admin && <span className="badge">Admin access</span>}
              {person.exec_roles?.map((role) => (
                <ExecRoleBadge key={role} role={role} />
              ))}
            </div>
            {member.is_owner &&
              person.is_admin &&
              person.status === "active" && (
                <ExecRoleControls member={person} />
              )}
            {person.display_name ? (
              <MemberControls member={person} self={person.id === member.id} />
            ) : (
              <p className="muted small">
                Waiting for this dancer to enter their name.
              </p>
            )}
          </article>
        ))}
      </section>
      <h2 className="section-label">Data</h2>
      <section className="panel stack">
        <h3>Team records</h3>
        <p className="muted small">
          Download a private copy of roster, assignments, tasks and payment
          history. Formation files and account backups are managed separately.
        </p>
        <a href="/api/admin/export" className="button secondary">
          Download team records (JSON)
        </a>
      </section>
    </>
  );
}
