"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "./forms";
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
  id,
  kind,
  post,
  people,
  groups,
  groupMembers,
  segments,
  assignments,
  assigned = [],
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
}) {
  const [state, action] = useActionState(saveCommunication, {
    error: null,
  } as FormState);
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
  const ids = post
    ? assigned
    : audience === "team"
      ? active.map((p) => p.id)
      : audience === "group"
        ? groupMembers
            .filter((g) => g.group_id === source)
            .map((g) => g.member_id)
        : audience === "segment"
          ? assignments
              .filter((a) => a.segment_id === source)
              .map((a) => a.member_id)
          : selected;
  const recipients = active.filter((p) => ids.includes(p.id));
  const base = kind === "task" ? "/todos" : "/announcements";
  return (
    <form action={action} className="segment-editor communication-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={post?.version ?? 0} />
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
            <label htmlFor="audience">Send to</label>
            <select
              id="audience"
              name="audience"
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
            {(audience === "group" || audience === "segment") && (
              <>
                <label htmlFor="source-id">
                  {audience === "group" ? "Group" : "Segment"}
                </label>
                <select
                  id="source-id"
                  name="source_id"
                  required
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Choose {audience}</option>
                  {(audience === "group" ? groups : segments)
                    .filter((g) => !g.archived_at)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
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
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton disabled={!post && !recipients.length}>
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
  operation: "complete" | "archive" | "restore" | "reopen";
  recipientId?: string;
  label: string;
}) {
  const [state, action] = useActionState(
    operation === "complete" ? completeCommunication : manageCommunication,
    { error: null } as FormState,
  );
  return (
    <form action={action} className="communication-action">
      <input type="hidden" name="id" value={post.id} />
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
  id,
  group,
  people,
  assigned = [],
}: {
  id: string;
  group?: CommunicationGroup;
  people: Member[];
  assigned?: string[];
}) {
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
    <form action={action} className="segment-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={group?.version ?? 0} />
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
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton disabled={!selected.length}>
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
    <form action={action}>
      <input type="hidden" name="id" value={group.id} />
      <input type="hidden" name="version" value={group.version} />
      <SubmitButton className="button secondary">Archive group</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}
