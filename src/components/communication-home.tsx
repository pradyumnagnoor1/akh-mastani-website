import Link from "next/link";
import { communicationData } from "@/features/communication/queries";
export async function CommunicationHome() {
  const { posts, recipients, member } = await communicationData();
  const mine = posts.filter(
    (p) =>
      !p.archived_at &&
      recipients.some((r) => r.post_id === p.id && r.member_id === member.id),
  );
  const todos = mine.filter(
    (p) =>
      p.kind === "task" &&
      !(p.completion_mode === "shared"
        ? p.completed_at
        : recipients.find(
            (r) => r.post_id === p.id && r.member_id === member.id,
          )?.completed_at),
  );
  const announcements = mine.filter((p) => p.kind === "announcement");
  return (
    <div className="home-grid">
      <section className="panel">
        <div className="section-toolbar">
          <h2>
            Your to-dos <span className="count">{todos.length}</span>
          </h2>
          <Link href="/todos" className="text-button">
            View all →
          </Link>
        </div>
        {todos.length ? (
          todos.slice(0, 4).map((p) => (
            <Link className="my-segment-row" key={p.id} href={`/todos/${p.id}`}>
              <strong>{p.title}</strong>
              <span className="muted small">
                {p.due_on ? `Due ${p.due_on}` : "No due date"}
              </span>
            </Link>
          ))
        ) : (
          <p className="muted">You’re all caught up.</p>
        )}
      </section>
      <section className="panel">
        <div className="section-toolbar">
          <h2>Announcements</h2>
          <Link href="/announcements" className="text-button">
            View all →
          </Link>
        </div>
        {announcements.length ? (
          announcements.slice(0, 4).map((p) => (
            <Link
              className="my-segment-row"
              key={p.id}
              href={`/announcements/${p.id}`}
            >
              <strong>{p.title}</strong>
              <span className="badge">
                {recipients.find(
                  (r) => r.post_id === p.id && r.member_id === member.id,
                )?.completed_at
                  ? "Read"
                  : "New"}
              </span>
            </Link>
          ))
        ) : (
          <p className="muted">No announcements for you yet.</p>
        )}
      </section>
    </div>
  );
}
