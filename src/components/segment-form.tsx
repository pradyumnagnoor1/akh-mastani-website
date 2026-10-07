"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { FileText, Search, Upload } from "lucide-react";
import {
  saveSegment,
  removeSegment,
  type SegmentFormState,
} from "@/features/segments/actions";
import { validatePdf, type Segment } from "@/features/segments/policy";
import type { Member } from "@/features/identity/policy";
import { SubmitButton } from "./forms";
export function SegmentForm({
  id,
  segment,
  people,
  assigned,
}: {
  id: string;
  segment?: Segment;
  people: Member[];
  assigned: string[];
}) {
  const [name, setName] = useState(segment?.name ?? "");
  const [selected, setSelected] = useState(new Set(assigned));
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, action] = useActionState(
    async (previous: SegmentFormState, data: FormData) => {
      if (file) {
        try {
          await validatePdf(file);
        } catch (error) {
          return { error: (error as Error).message };
        }
        data.set("pdf", file);
      }
      return saveSegment(previous, data);
    },
    { error: null },
  );
  const filtered = people.filter((p) =>
    `${p.display_name} ${p.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <form action={action} className="segment-editor">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={segment?.version ?? 0} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <section className="panel stack">
        <p className="eyebrow">01 / THE SEGMENT</p>
        <label htmlFor="segment-name">Segment name</label>
        <input
          id="segment-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          placeholder="e.g. Opening, Bollywood, Finale"
        />
        <div className="file-field">
          <Upload size={24} />
          <div>
            <label htmlFor="formation-pdf">
              {segment ? "Replace formation PDF" : "Formation PDF"}
            </label>
            <p className="muted small">
              PDF only · Up to 4 MB
              {segment ? " · Leave empty to keep the current document" : ""}
            </p>
          </div>
          <input
            id="formation-pdf"
            type="file"
            name="pdf"
            accept="application/pdf,.pdf"
            required={!segment && !file}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="file-selected">
              <FileText size={15} />
              {file.name}
            </p>
          )}
          {!file && segment && (
            <p className="muted small">Current: {segment.document_label}</p>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">02 / THE DANCERS</p>
            <h2>
              Build this lineup{" "}
              <span className="count" aria-live="polite">
                {selected.size} selected
              </span>
            </h2>
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              setSelected(
                selected.size === people.length
                  ? new Set()
                  : new Set(people.map((p) => p.id)),
              )
            }
          >
            {selected.size === people.length
              ? "Clear selection"
              : "Select entire team"}
          </button>
        </div>
        <label htmlFor="dancer-search" className="small muted">
          Find a dancer
        </label>
        <div className="picker-search">
          <Search size={18} />
          <input
            id="dancer-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names or emails"
          />
        </div>
        <div className="dancer-picker">
          {filtered.map((person) => (
            <label
              className={`dancer-option ${selected.has(person.id) ? "chosen" : ""}`}
              key={person.id}
            >
              <input
                type="checkbox"
                checked={selected.has(person.id)}
                onChange={() => toggle(person.id)}
              />
              <span>
                <strong>{person.display_name}</strong>
                <small>{person.email}</small>
              </span>
              {person.is_admin && <span className="badge">Admin · Dancer</span>}
            </label>
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="empty">No dancers match your search.</p>
        )}
        <p className="muted small picker-note">
          Assignments appear on each dancer’s roster entry automatically. Admins
          can be assigned just like any other dancer.
        </p>
      </section>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <SubmitButton pendingText="Saving segment…">
          {segment ? "Save changes" : "Create segment"}{" "}
          <span aria-hidden="true">→</span>
        </SubmitButton>
        <Link
          className="button secondary"
          href={segment ? `/segments/${id}` : "/segments"}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function RemoveSegmentForm({ segment }: { segment: Segment }) {
  const [state, action] = useActionState(removeSegment, { error: null });
  return (
    <details className="remove-segment">
      <summary>Remove this segment</summary>
      <form action={action} className="stack">
        <input type="hidden" name="id" value={segment.id} />
        <input type="hidden" name="version" value={segment.version} />
        <p>
          This removes <strong>{segment.name}</strong> from team views and
          active roster assignments. Its PDF and history remain available to
          admins in the archive.
        </p>
        <label className="confirm-check">
          <input type="checkbox" name="confirm" value="yes" required />I want to
          remove this segment
        </label>
        {state.error && (
          <p className="notice error" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton className="button danger" pendingText="Removing…">
          Remove segment
        </SubmitButton>
      </form>
    </details>
  );
}
