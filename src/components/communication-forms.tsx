"use client";
import { savedAudience } from "@/features/communication/saved-groups";
import { SavedGroupOptions } from "./saved-group-options";
import Link from "@/components/app-link";
import { useActionState, useState } from "react";
import { ExpirationField } from "./expiration-field";
import { AnnouncementImageUpload } from "./announcement-image-upload";
import { AnnouncementReminderFields } from "./announcement-reminder-fields";
import { SubmitButton } from "./forms";
import { DraftConflict, useDraftRevision } from "./draft-revision";
import {
  saveCommunication,
  completeCommunication,
  manageCommunication,
  saveGroup,
  archiveGroup,
} from "@/features/communication/actions";
import type {
  Audience,
  CommunicationPost,
  CommunicationGroup,
  GroupMember,
  FormState,
  PostKind,
} from "@/features/communication/types";
import { eventWhen, type CalendarView } from "@/features/calendar/types";
import { practiceIdentity } from "@/features/calendar/day";
import type { Member } from "@/features/identity/policy";
import type { Segment, Assignment } from "@/features/segments/policy";
function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="notice">
          {state.success}
        </p>
      )}
    </>
  );
}
function PeoplePicker({
  people,
  selected,
  setSelected,
  single = false,
}: {
  people: Member[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  single?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = people.filter((p) =>
    `${p.display_name} ${p.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label htmlFor="recipient-search">Find a dancer</label>
      <input
        id="recipient-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search names or emails"
      />
      <div className="dancer-picker">
        {filtered.map((p) => (
          <label
            key={p.id}
            className={`dancer-option ${selected.includes(p.id) ? "chosen" : ""}`}
          >
            <input
              type={single ? "radio" : "checkbox"}
              name={single ? "person-picker" : undefined}
              checked={selected.includes(p.id)}
              onChange={() =>
                setSelected(
                  single
                    ? [p.id]
                    : selected.includes(p.id)
                      ? selected.filter((id) => id !== p.id)
                      : [...selected, p.id],
                )
              }
            />
            <span>
              <strong>{p.display_name ?? p.email}</strong>
              <small>{p.email}</small>
            </span>
            {p.is_admin && <span className="badge">Admin · Dancer</span>}
          </label>
        ))}
      </div>
      {!filtered.length && (
        <p className="muted">No dancers match your search.</p>
      )}
    </>
  );
}
export function CommunicationForm({
  id: initialId,
  kind,
  post,
  people,
  groups,
  groupMembers,
  segments,
  assignments,
  assigned = [],
  tasks = [],
  editorMember,
  calendar,
}: {
  id: string;
  kind: PostKind;
  post?: CommunicationPost;
  people: Member[];
  groups: CommunicationGroup[];
  groupMembers: GroupMember[];
  segments: Segment[];
  assignments: Assignment[];
  assigned?: string[];
  tasks?: CommunicationPost[];
  editorMember: Member;
  calendar?: CalendarView;
}) {
  const { id, version, changed } = useDraftRevision(initialId, post?.version);
  const [state, action] = useActionState(saveCommunication, {
    error: null,
  } as FormState);
  const [announcementType, setAnnouncementType] = useState(
    post?.practice_event_id ? "practice" : "announcement",
  );
  const [practice, setPractice] = useState(post?.practice_event_id ?? "");
  const [postingRole, setPostingRole] = useState(
    post ? (post.author_exec_role ?? "") : (editorMember.exec_roles?.[0] ?? ""),
  );
  const [practiceSource, setPracticeSource] = useState(
    post?.practice_source ?? calendar?.source ?? "",
  );
  const [openedAt] = useState(() => Date.now());
  const practices =
    calendar?.events.filter(
      (e) => !e.allDay && Date.parse(e.start) > openedAt,
    ) ?? [];
  const selectedPractice =
    calendar?.source === practiceSource
      ? calendar?.events.find((e) => practiceIdentity(e) === practice)
      : undefined;
  const [imageBusy, setImageBusy] = useState(false);
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [due, setDue] = useState(post?.due_on ?? "");
  const [audience, setAudience] = useState<Audience>(
    post?.audience_type ?? "team",
  );
  const [source, setSource] = useState(post?.audience_source_id ?? "");
  const [selected, setSelected] = useState(assigned);
  const [mode, setMode] = useState(post?.completion_mode ?? "individual");
  const active = people.filter((p) => p.status === "active");
  const resolved = savedAudience(audience, source);
  const ids = post
    ? assigned
    : audience === "team"
      ? active.map((p) => p.id)
      : resolved.audience === "group"
        ? groupMembers
            .filter((g) => g.group_id === resolved.source)
            .map((g) => g.member_id)
        : resolved.audience === "segment"
          ? assignments
              .filter((a) => a.segment_id === resolved.source)
              .map((a) => a.member_id)
          : selected;
  const recipients = active.filter((p) => ids.includes(p.id));
  const base = kind === "task" ? "/todos" : "/announcements";
  return (
    <form
      data-mutation-form
      action={action}
      className="segment-editor communication-form"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="kind" value={kind} />
      {(audience === "individual" || audience === "selected"
        ? post
          ? assigned
          : selected
        : []
      ).map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <section className="panel stack">
        <p className="eyebrow">01 / THE MESSAGE</p>
        {kind === "announcement" && (
          <>
            <label htmlFor="posting-role">Posting as</label>
            <select
              id="posting-role"
              name="posting_role"
              value={postingRole}
              disabled={!!post}
              onChange={(e) => setPostingRole(e.target.value)}
            >
              {(!editorMember.exec_roles?.length ||
                (post && !post.author_exec_role)) && (
                <option value="">
                  {editorMember.display_name} · Team announcement
                </option>
              )}
              {[
                ...new Set([
                  ...(editorMember.exec_roles ?? []),
                  ...(post?.author_exec_role ? [post.author_exec_role] : []),
                ]),
              ].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {post && (
              <input type="hidden" name="posting_role" value={postingRole} />
            )}
            <label htmlFor="announcement-type">Announcement type</label>
            <select
              id="announcement-type"
              value={announcementType}
              onChange={(e) => setAnnouncementType(e.target.value)}
              disabled={changed}
            >
              <option value="announcement">Announcement</option>
              <option value="practice">Practice announcement</option>
            </select>
            {announcementType === "practice" && (
              <>
                <label htmlFor="practice-event">Practice</label>
                <select
                  id="practice-event"
                  name="practice_id"
                  required
                  value={practice}
                  disabled={changed}
                  onChange={(e) => {
                    setPractice(e.target.value);
                    setPracticeSource(calendar?.source ?? "");
                  }}
                >
                  <option value="">Choose an upcoming practice</option>
                  {post?.practice_event_id &&
                    !practices.some(
                      (e) => practiceIdentity(e) === post.practice_event_id,
                    ) && (
                      <option value={post.practice_event_id}>
                        {post.practice_snapshot?.title ?? "Linked practice"} ·
                        Previously linked
                      </option>
                    )}
                  {practices.map((e) => (
                    <option key={e.id} value={practiceIdentity(e)}>
                      {e.title} · {eventWhen(e)}
                      {e.location ? ` · ${e.location}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="hidden"
                  name="calendar_source"
                  value={practiceSource}
                />
                {!practices.length && (
                  <p className="notice">
                    No upcoming timed practices are available. Check the
                    calendar connection and try again.
                  </p>
                )}
                <p className="notice">
                  This announcement shares the practice reminder, scheduled one
                  hour before practice. It will not send a separate announcement
                  reminder. Quiet hours and notification preferences apply.
                </p>
                {selectedPractice && (
                  <p className="muted small">
                    {eventWhen(selectedPractice)} ·{" "}
                    {selectedPractice.location ?? "Location to be confirmed"}
                  </p>
                )}
              </>
            )}
          </>
        )}
        <label htmlFor="post-title">Title</label>
        <input
          id="post-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
        />
        <label htmlFor="post-body">Details</label>
        <textarea
          id="post-body"
          name="body"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={6000}
          required
        />
        <ExpirationField expiresAt={post?.expires_at} />
        {kind === "announcement" && (
          <AnnouncementImageUpload
            id={id}
            version={version}
            disabled={changed}
            initialPath={post?.image_path}
            initialDescription={post?.image_description}
            onBusyChange={setImageBusy}
          />
        )}
        {kind === "task" && (
          <>
            <label htmlFor="due-on">Due date (optional)</label>
            <input
              id="due-on"
              name="due_on"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </>
        )}
      </section>
      <section className="panel stack">
        <p className="eyebrow">02 / THE DANCERS</p>
        {post ? (
          <>
            <input type="hidden" name="audience" value={audience} />
            <input type="hidden" name="source_id" value={source} />
            <input type="hidden" name="mode" value={mode} />
            <h2>{post.audience_label}</h2>
            <p className="muted">
              This item keeps its original recipients and{" "}
              {kind === "announcement"
                ? "individual acknowledgment"
                : `${mode === "shared" ? "shared" : "individual"} completion`}
              . Content edits preserve existing progress.
            </p>
          </>
        ) : (
          <>
            <input type="hidden" name="audience" value={resolved.audience} />
            <label htmlFor="audience">Send to</label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience);
                setSource("");
                setSelected([]);
              }}
            >
              <option value="team">Entire team</option>
              <option value="individual">One dancer</option>
              <option value="selected">Selected dancers</option>
              <option value="group">Saved group</option>
              <option value="segment">Segment lineup</option>
            </select>
            {(audience === "individual" || audience === "selected") && (
              <PeoplePicker
                people={active}
                selected={selected}
                setSelected={setSelected}
                single={audience === "individual"}
              />
            )}{" "}
            <input type="hidden" name="source_id" value={resolved.source} />
            {(audience === "group" || audience === "segment") && (
              <>
                <label htmlFor="source-id">
                  {audience === "group" ? "Group" : "Segment"}
                </label>
                <select
                  id="source-id"
                  name="source-picker"
                  required
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Choose {audience}</option>
                  {audience === "group" ? (
                    <SavedGroupOptions groups={groups} segments={segments} />
                  ) : (
                    segments
                      .filter((g) => !g.archived_at)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))
                  )}{" "}
                </select>
              </>
            )}
            <Link className="accent small" href="/admin/groups">
              Manage saved groups →
            </Link>
            {kind === "announcement" ? (
              <>
                <input type="hidden" name="mode" value="individual" />
                <p className="muted small">
                  Each dancer acknowledges this announcement individually with
                  Mark as read.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="completion-mode">Completion</label>
                <select
                  id="completion-mode"
                  name="mode"
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "individual" | "shared")
                  }
                >
                  <option value="individual">
                    Each dancer completes individually
                  </option>
                  <option value="shared">
                    One dancer completes for everyone
                  </option>
                </select>
                <p className="muted small">
                  {mode === "shared"
                    ? "Any recipient can complete this for the whole group. Everyone will see who completed it."
                    : "Each recipient has their own progress."}
                </p>
              </>
            )}
            <div className="recipient-preview" aria-live="polite">
              <h3>
                Recipient preview · {recipients.length}{" "}
                {recipients.length === 1 ? "dancer" : "dancers"}
              </h3>
              <p>
                {recipients.map((p) => p.display_name ?? p.email).join(", ") ||
                  "Choose at least one active dancer."}
              </p>
            </div>
            <p className="muted small">
              Recipients are saved as a snapshot when you create this item.
              Later group, segment, or team membership changes do not retarget
              it.
            </p>
          </>
        )}
      </section>
      <DraftConflict changed={changed} />
      {kind === "announcement" && announcementType !== "practice" && (
        <AnnouncementReminderFields
          post={post}
          tasks={tasks}
          disabled={changed}
        />
      )}
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton
          disabled={changed || imageBusy || (!post && !recipients.length)}
        >
          {post
            ? "Save changes"
            : kind === "task"
              ? "Create to-do"
              : "Publish announcement"}
        </SubmitButton>
        <Link className="button secondary" href={post ? `${base}/${id}` : base}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function CommunicationAction({
  post,
  operation,
  recipientId,
  label,
}: {
  post: CommunicationPost;
  operation: "complete" | "delete" | "reopen";
  recipientId?: string;
  label: string;
}) {
  const [state, action] = useActionState(
    operation === "complete" ? completeCommunication : manageCommunication,
    { error: null } as FormState,
  );
  return (
    <form
      data-mutation-form
      action={action}
      className="communication-action"
      onSubmit={(e) => {
        if (
          operation === "delete" &&
          !window.confirm(
            "Permanently delete this item and its history? This cannot be undone.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="kind" value={post.kind} />
      <input type="hidden" name="version" value={post.version} />
      <input type="hidden" name="operation" value={operation} />
      {recipientId && (
        <input type="hidden" name="recipient_id" value={recipientId} />
      )}
      <SubmitButton
        className={`button ${operation === "complete" ? "primary" : "secondary"}`}
      >
        {label}
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}
export function GroupForm({
  id: initialId,
  group,
  people,
  assigned = [],
}: {
  id: string;
  group?: CommunicationGroup;
  people: Member[];
  assigned?: string[];
}) {
  const { id, version, changed } = useDraftRevision(initialId, group?.version);
  const [state, action] = useActionState(saveGroup, {
    error: null,
  } as FormState);
  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState(
    assigned.filter((id) =>
      people.some((person) => person.id === id && person.status === "active"),
    ),
  );
  return (
    <form
      data-mutation-form
      action={action}
      className="segment-editor"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <section className="panel stack">
        {assigned.some(
          (id) =>
            !people.some(
              (person) => person.id === id && person.status === "active",
            ),
        ) && (
          <p className="notice">
            Inactive dancers have been removed from this selection. Saving
            updates the group for future items.
          </p>
        )}
        <label htmlFor="group-name">Group name</label>
        <input
          id="group-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        <h2>
          Dancers <span className="count">{selected.length} selected</span>
        </h2>
        <PeoplePicker
          people={people.filter((p) => p.status === "active")}
          selected={selected}
          setSelected={setSelected}
        />
        <p className="muted small">
          Changes apply to future recipient selections. Existing announcements
          and to-dos keep their original recipients.
        </p>
      </section>
      <DraftConflict changed={changed} />
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton disabled={changed || !selected.length}>
          {group ? "Save group" : "Create group"}
        </SubmitButton>
        <Link className="button secondary" href="/admin/groups">
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function ArchiveGroup({ group }: { group: CommunicationGroup }) {
  const [state, action] = useActionState(archiveGroup, {
    error: null,
  } as FormState);
  return (
    <form
      data-mutation-form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete the group “${group.name}”? Existing assignments will remain unchanged.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={group.id} />
      <input type="hidden" name="version" value={group.version} />
      <SubmitButton className="button secondary">Delete group</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}
