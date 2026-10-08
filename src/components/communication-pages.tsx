import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  communicationData,
  communicationEditorData,
} from "@/features/communication/queries";
import type {
  PostKind,
  CommunicationPost,
  Recipient,
} from "@/features/communication/types";
import { CommunicationAction, CommunicationForm } from "./communication-forms";
const baseFor = (kind: PostKind) =>
  kind === "task" ? "/todos" : "/announcements";
const headingFor = (kind: PostKind) =>
  kind === "task" ? "To-Dos" : "Announcements";
function completed(
  post: CommunicationPost,
  rows: Recipient[],
  memberId: string,
) {
  return post.completion_mode === "shared"
    ? !!post.completed_at
    : !!rows.find((r) => r.member_id === memberId)?.completed_at;
}
export async function CommunicationList({
  kind,
  view,
}: {
  kind: PostKind;
  view?: string;
}) {
  const { member, posts, recipients } = await communicationData();
  const base = baseFor(kind);
  const tab = member.is_admin && view === "all" ? "all" : "mine";
  const items = posts.filter(
    (p) =>
      p.kind === kind &&
      !p.archived_at &&
      (tab !== "mine" ||
        recipients.some(
          (r) => r.post_id === p.id && r.member_id === member.id,
        )),
  );
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>{headingFor(kind)}</h1>
          <p className="muted">
            {kind === "task"
              ? "Your assigned tasks."
              : "The latest updates for your team."}
          </p>
        </div>
        {member.is_admin && (
          <Link className="button primary" href={`${base}/new`}>
            {kind === "task" ? "Create to-do" : "New announcement"}
          </Link>
        )}
      </div>
      {member.is_admin && (
        <div className="section-toolbar">
          <nav className="view-tabs" aria-label="Communication views">
            <Link className={tab === "mine" ? "active" : ""} href={base}>
              For me
            </Link>
            <Link
              className={tab === "all" ? "active" : ""}
              href={`${base}?view=all`}
            >
              All team
            </Link>
          </nav>
          <Link className="text-button" href="/admin/groups">
            Manage groups →
          </Link>
        </div>
      )}
      <div className="communication-list">
        {items.map((post) => {
          const rows = recipients.filter((r) => r.post_id === post.id);
          const done = completed(post, rows, member.id);
          return (
            <article className="panel communication-card" key={post.id}>
              <div className="communication-meta">
                <span className="badge">
                  {post.completion_mode === "shared"
                    ? "Shared completion"
                    : kind === "announcement"
                      ? "Individual acknowledgment"
                      : "Individual completion"}
                </span>
                {post.due_on && (
                  <span className="muted small">Due {post.due_on}</span>
                )}
                {tab === "mine" && (
                  <span className={`badge ${done ? "success" : ""}`}>
                    {done
                      ? kind === "task"
                        ? "Done"
                        : "Read"
                      : kind === "task"
                        ? "To do"
                        : "Unread"}
                  </span>
                )}
              </div>
              <h2>
                <Link href={`${base}/${post.id}`}>{post.title}</Link>
              </h2>
              <p className="muted communication-excerpt">{post.body}</p>
              <div className="communication-footer">
                <span className="small muted">
                  {post.audience_label}
                  {member.is_admin &&
                    ` · ${post.completion_mode === "shared" ? (post.completed_at ? rows.length : 0) : rows.filter((r) => r.completed_at).length}/${rows.length} ${kind === "task" ? "done" : "read"}`}
                </span>
                <Link
                  className="text-button accent"
                  href={`${base}/${post.id}`}
                >
                  View {kind === "task" ? "to-do" : "announcement"} →
                </Link>
              </div>
            </article>
          );
        })}
        {!items.length && (
          <section className="panel empty-state">
            <h2>
              {kind === "announcement" ? "No announcements" : "No open to-dos"}
            </h2>
            <p className="muted">
              {tab === "mine"
                ? `No active ${kind === "task" ? "to-dos" : "announcements"} have been assigned to you.`
                : "Create an item to bring the team up to date."}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
export async function CommunicationDetail({
  kind,
  id,
}: {
  kind: PostKind;
  id: string;
}) {
  const { member, supabase, posts, recipients } = await communicationData();
  const post = posts.find((p) => p.id === id && p.kind === kind);
  if (!post || post.archived_at) notFound();
  const rows = recipients.filter((r) => r.post_id === id);
  const mine = rows.find((r) => r.member_id === member.id);
  const done = completed(post, rows, member.id);
  const base = baseFor(kind);
  const memberIds = member.is_admin ? rows.map((r) => r.member_id) : [];
  if (post.completed_by) memberIds.push(post.completed_by);
  const names = new Map<string, string>();
  if (memberIds.length) {
    const result = await supabase
      .from("members")
      .select("id,display_name")
      .in("id", [...new Set(memberIds)]);
    if (result.error) throw new Error("Unable to load completion details.");
    for (const person of result.data ?? [])
      names.set(person.id, person.display_name ?? "Team member");
  }
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href={base}>
          ← {headingFor(kind)}
        </Link>
        <p className="eyebrow">{post.audience_label}</p>
        <h1>{post.title}</h1>
        <div className="communication-meta">
          <span className="badge">
            {post.completion_mode === "shared"
              ? "One completion for everyone"
              : kind === "announcement"
                ? "Each dancer acknowledges individually"
                : "Each dancer completes individually"}
          </span>
          {post.due_on && <span className="muted">Due {post.due_on}</span>}
        </div>
      </div>
      <section className="panel">
        <p className="communication-body">{post.body}</p>
        {post.completion_mode === "shared" && post.completed_at ? (
          <p className="notice">
            Completed by {names.get(post.completed_by ?? "") ?? "a teammate"}{" "}
            for everyone.
          </p>
        ) : mine && done ? (
          <p className="notice">
            {kind === "task"
              ? "You’ve completed this to-do."
              : "You’ve read this announcement."}
          </p>
        ) : null}
        {mine && !done && !post.archived_at && (
          <CommunicationAction
            post={post}
            operation="complete"
            label={kind === "task" ? "Mark done" : "Mark as read"}
          />
        )}
      </section>
      {member.is_admin && (
        <section className="panel communication-management">
          <div className="section-toolbar">
            <h2>
              {kind === "announcement" ? "Acknowledgments" : "Completion"} ·{" "}
              {post.completion_mode === "shared"
                ? post.completed_at
                  ? rows.length
                  : 0
                : rows.filter((r) => r.completed_at).length}
              /{rows.length}
            </h2>
            {!post.archived_at && (
              <Link className="button secondary" href={`${base}/${id}/edit`}>
                Edit {kind === "task" ? "to-do" : "announcement"}
              </Link>
            )}
          </div>
          <p className="muted small">
            Original recipient snapshot · {post.audience_label}
          </p>
          {rows.map((row) => (
            <div className="lineup-person" key={row.member_id}>
              <span>{names.get(row.member_id) ?? "Former team member"}</span>
              <span className="badge">
                {(
                  post.completion_mode === "shared"
                    ? post.completed_at
                    : row.completed_at
                )
                  ? kind === "task"
                    ? "Done"
                    : "Read"
                  : kind === "task"
                    ? "To do"
                    : "Unread"}
              </span>
              {post.completion_mode === "individual" &&
                row.completed_at &&
                !post.archived_at && (
                  <CommunicationAction
                    post={post}
                    operation="reopen"
                    recipientId={row.member_id}
                    label={`Reopen for ${names.get(row.member_id) ?? "member"}`}
                  />
                )}
            </div>
          ))}
          <div className="actions">
            {!post.archived_at &&
              (post.completed_at || rows.some((r) => r.completed_at)) && (
                <CommunicationAction
                  post={post}
                  operation="reopen"
                  label={
                    post.completion_mode === "shared"
                      ? "Reopen shared item"
                      : "Reopen for everyone"
                  }
                />
              )}
            <CommunicationAction
              post={post}
              operation="delete"
              label={kind === "task" ? "Delete to-do" : "Delete announcement"}
            />
          </div>
        </section>
      )}
    </>
  );
}
export async function CommunicationEditor({
  kind,
  id,
}: {
  kind: PostKind;
  id?: string;
}) {
  const editor = await communicationEditorData();
  const data = id ? await communicationData() : null;
  const post = data?.posts.find((p) => p.id === id && p.kind === kind);
  if (id && !post) notFound();
  if (post?.archived_at) redirect(`${baseFor(kind)}/${post.id}`);
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href={baseFor(kind)}>
          ← {headingFor(kind)}
        </Link>
        <h1>
          {id ? "Edit" : "New"} {kind === "task" ? "to-do" : "announcement"}
        </h1>
        <p className="muted">Enter the details and select recipients.</p>
      </div>
      <CommunicationForm
        {...editor}
        id={id ?? crypto.randomUUID()}
        kind={kind}
        post={post}
        assigned={
          data?.recipients
            .filter((r) => r.post_id === id)
            .map((r) => r.member_id) ?? []
        }
      />
    </>
  );
}
