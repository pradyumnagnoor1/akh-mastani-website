import { AdminSummary } from "@/components/admin-summary";
import Link from "next/link";
import { requireAdmin } from "@/features/identity/session";
import { MemberControls } from "@/components/forms";
import type { Member } from "@/features/identity/policy";
export default async function Admin() {
  const { supabase, member } = await requireAdmin();
  const { data, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load membership requests.");
  const people = data as Member[];
  const pending = people.filter((p) => p.status === "pending");
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">A LITTLE ORGANIZING. A LOT MORE DANCING.</p>
        <h1>
          Team management<span className="accent">.</span>
        </h1>
        <p className="muted">
          Manage access while keeping your own place on the team.
        </p>
      </div>
      <AdminSummary />
      <section className="panel my-segments">
        <h2>Team records</h2>
        <p className="muted">
          Download a private copy of roster, assignments, tasks and payment
          history. Formation files and account backups are managed separately.
        </p>
        <a href="/api/admin/export" className="button secondary">
          Download team records (JSON)
        </a>
      </section>
      <Link href="/segments" className="admin-shortcut">
        Manage set design{" "}
        <span>Segments, formation PDFs & dancer assignments →</span>
      </Link>
      <Link href="/announcements?view=all" className="admin-shortcut">
        Manage announcements{" "}
        <span>Publish messages and review acknowledgment →</span>
      </Link>
      <Link href="/todos?view=all" className="admin-shortcut">
        Manage to-dos <span>Assign action items and review progress →</span>
      </Link>
      <Link href="/admin/groups" className="admin-shortcut">
        Manage groups <span>Reusable dancer groups for targeted items →</span>
      </Link>
      <Link href="/payments?view=reported" className="admin-shortcut">
        Review payments{" "}
        <span>Verify reported payments and manage charges →</span>
      </Link>
      <Link href="/admin/calendar" className="admin-shortcut">
        Connect Google Calendar{" "}
        <span>
          Connect, reconnect or disconnect the shared practice calendar →
        </span>
      </Link>
      <div className="notice">
        <strong>
          {pending.length} membership{" "}
          {pending.length === 1 ? "request" : "requests"} awaiting review
        </strong>
        <p>Confirm each person belongs to the team before approving access.</p>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <h2>Members & requests</h2>
          <span className="badge">{people.length} members</span>
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
            </div>
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
    </>
  );
}
