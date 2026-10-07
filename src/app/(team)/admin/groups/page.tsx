import Link from "next/link";
import { communicationEditorData } from "@/features/communication/queries";
import { ArchiveGroup } from "@/components/communication-forms";
export default async function GroupsPage() {
  const { groups, groupMembers, people } = await communicationEditorData();
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <Link className="back-link" href="/admin">
            ← Admin
          </Link>
          <h1>
            Saved groups<span className="accent">.</span>
          </h1>
          <p className="muted">
            Reusable dancer groups for announcements and to-dos.
          </p>
        </div>
        <Link className="button primary" href="/admin/groups/new">
          Create group
        </Link>
      </div>
      <p className="notice">
        Group changes affect future items. Existing recipients and completion
        history stay intact.
      </p>
      <div className="communication-list">
        {groups.map((group) => {
          const ids = groupMembers
            .filter((m) => m.group_id === group.id)
            .map((m) => m.member_id);
          const names = people.filter((p) => ids.includes(p.id));
          return (
            <section className="panel" key={group.id}>
              <div className="section-toolbar">
                <h2>{group.name}</h2>
                <span className="badge">
                  {group.archived_at
                    ? "Archived"
                    : `${names.length} active dancers`}
                </span>
              </div>
              <p className="muted">
                {names.map((p) => p.display_name ?? p.email).join(", ") ||
                  "No active dancers"}
              </p>
              {!group.archived_at && (
                <div className="actions">
                  <Link
                    className="button secondary"
                    href={`/admin/groups/${group.id}/edit`}
                  >
                    Edit group
                  </Link>
                  <ArchiveGroup group={group} />
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && (
          <section className="panel empty-state">
            <h2>Your first group starts here</h2>
            <p className="muted">
              Save a set of dancers you often need to reach together.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
