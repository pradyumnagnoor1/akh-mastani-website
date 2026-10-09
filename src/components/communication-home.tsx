/* eslint-disable react-hooks/purity -- Server components capture request time for expiration timers. */
import { Expires } from "./expires";
import { AnnouncementImage } from "./announcement-image";
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
            <Expires key={p.id} at={p.expires_at} serverNow={Date.now()}>
              <Link className="my-segment-row" href={`/todos/${p.id}`}>
                <strong>{p.title}</strong>
                <span className="muted small">
                  {p.due_on ? `Due ${p.due_on}` : "No due date"}
                </span>
              </Link>
            </Expires>
          ))
        ) : (
          <p className="muted">No open to-dos.</p>
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
            <Expires key={p.id} at={p.expires_at} serverNow={Date.now()}>
              <div>
                <Link
                  className="my-segment-row"
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
                <AnnouncementImage
                  id={p.id}
                  path={p.image_path}
                  description={p.image_description}
                />
              </div>
            </Expires>
          ))
        ) : (
          <p className="muted">No announcements for you yet.</p>
        )}
      </section>
    </div>
  );
}
