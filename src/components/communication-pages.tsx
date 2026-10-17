/* eslint-disable react-hooks/purity -- Server components capture request time for expiration timers. */
import { AnnouncementAttribution } from "./announcement-attribution";
import { ReadBadge } from "./read-badge";
import {
  canPostAnnouncements,
  canManagePost,
} from "@/features/identity/policy";
import { calendarData } from "@/features/calendar/queries";
import { practiceIdentity } from "@/features/calendar/day";
import { eventWhen } from "@/features/calendar/types";
import { Expires } from "./expires";
import { MessageText } from "./message-text";
import { AnnouncementImage } from "./announcement-image";
import Link from "@/components/app-link";
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
  const writer =
    member.is_admin ||
    (kind === "announcement" && canPostAnnouncements(member));
  const tab = writer && view === "all" ? "all" : "mine";
  const items = posts.filter(
    (p) =>
      p.kind === kind &&
      !p.archived_at &&
      (tab === "all" && !member.is_admin
        ? p.created_by === member.id
        : tab !== "mine" ||
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
        {writer && (
          <Link className="button primary" href={`${base}/new`}>
            {kind === "task" ? "Create to-do" : "New announcement"}
          </Link>
        )}
      </div>
      {writer && (
        <div className="section-toolbar">
          <nav className="view-tabs" aria-label="Communication views">
            <Link className={tab === "mine" ? "active" : ""} href={base}>
              For me
            </Link>
            <Link
              className={tab === "all" ? "active" : ""}
              href={`${base}?view=all`}
            >
              {member.is_admin ? "All team" : "My posts"}
            </Link>
          </nav>
          {member.is_admin && (
            <Link className="text-button" href="/admin/groups">
              Manage groups →
            </Link>
          )}
        </div>
      )}
      <div className="communication-list">
        {items.map((post) => {
          const rows = recipients.filter((r) => r.post_id === post.id);
          const done = completed(post, rows, member.id);
          return (
            <Expires key={post.id} at={post.expires_at} serverNow={Date.now()}>
              <article className="panel communication-card">
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
                    <span
                      className={`badge ${done ? "success" : kind === "announcement" ? "unread" : ""}`}
                    >
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
                {kind === "announcement" && (
                  <>
                    <AnnouncementAttribution post={post} />
                    {post.practice_event_id && (
                      <span className="badge">Practice announcement</span>
                    )}
                  </>
                )}
                <h2>
                  <Link href={`${base}/${post.id}`}>{post.title}</Link>
                </h2>
                <p className="muted communication-excerpt">
                  <MessageText text={post.body} />
                </p>
                <AnnouncementImage
                  id={post.id}
                  path={post.image_path}
                  description={post.image_description}
                />
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
            </Expires>
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
  const manager = canManagePost(member, post);
  const calendar = post.practice_event_id
    ? (await calendarData()).calendar
    : null;
  const practice = calendar?.events.find(
    (e) =>
      practiceIdentity(e) === post.practice_event_id &&
      (e.source ?? calendar.source) === post.practice_source,
  );
  const memberIds = manager ? rows.map((r) => r.member_id) : [];
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
    <Expires at={post.expires_at} serverNow={Date.now()} detail>
      <div className="page-heading">
        <Link className="back-link" href={base}>
          ← {headingFor(kind)}
        </Link>
        <p className="eyebrow">{post.audience_label}</p>
        <h1>{post.title}</h1>
        {kind === "announcement" && (
          <>
            <AnnouncementAttribution post={post} />
            {mine && <ReadBadge read={done} />}
          </>
        )}
        {post.practice_event_id && (
          <section className="notice">
            <strong>
              Practice announcement ·{" "}
              {practice?.title ??
                post.practice_snapshot?.title ??
                "Linked practice"}
            </strong>
            <p>
              {practice
                ? eventWhen(practice)
                : post.practice_snapshot
                  ? eventWhen(post.practice_snapshot)
                  : ""}
            </p>
            <p>{practice?.location ?? post.practice_snapshot?.location}</p>
            {!practice && (
              <p>
                Practice unavailable in the current schedule. It may have been
                cancelled, removed, or moved outside the calendar window.
              </p>
            )}
            <p>This announcement shares the practice reminder.</p>
            <Link
              href={`/calendar${practice ? `?date=${practice.allDay ? practice.start : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(practice.start))}` : ""}`}
              className="text-button"
            >
              View practice calendar →
            </Link>
          </section>
        )}
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
        <p className="communication-body">
          <MessageText text={post.body} />
        </p>
        {post.reminder_at && (
          <div className="notice">
            <strong>
              Reminder ·{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Chicago",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(post.reminder_at))}{" "}
              Texas time
            </strong>
            {post.reminder_message && (
              <p>
                <MessageText text={post.reminder_message} />
              </p>
            )}
            <p className="small">
              {post.reminder_mode === "preparation"
                ? "Preparation reminder · acknowledgment does not stop it."
                : post.reminder_mode === "linked-task"
                  ? "Stops when your linked to-do is complete."
                  : "Stops once you acknowledge."}
            </p>
          </div>
        )}
        <AnnouncementImage
          id={post.id}
          path={post.image_path}
          description={post.image_description}
        />
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
      {manager && (
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
              <span
                className={`badge ${kind === "announcement" ? (row.completed_at ? "success" : "unread") : ""}`}
              >
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
    </Expires>
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
  if (kind === "task" && !editor.editorMember.is_admin) redirect("/home");
  const calendar =
    kind === "announcement" ? (await calendarData()).calendar : undefined;
  const data = id || kind === "announcement" ? await communicationData() : null;
  const post = data?.posts.find((p) => p.id === id && p.kind === kind);
  if (id && (!post || !canManagePost(editor.editorMember, post))) notFound();
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
      <Expires at={post?.expires_at} serverNow={Date.now()} detail>
        <CommunicationForm
          key={id ?? `new-${kind}`}
          {...editor}
          id={id ?? crypto.randomUUID()}
          customPracticeDraftId={crypto.randomUUID()}
          kind={kind}
          calendar={calendar}
          post={post}
          tasks={
            data?.posts.filter((p) => p.kind === "task" && !p.completed_at) ??
            []
          }
          assigned={
            data?.recipients
              .filter((r) => r.post_id === id)
              .map((r) => r.member_id) ?? []
          }
        />
      </Expires>
    </>
  );
}
