"use client";
import { useActionState } from "react";
import type { CalendarEvent } from "@/features/calendar/types";
import {
  saveCustomPractice,
  deleteCustomPractice,
} from "@/features/custom-practices/actions";
import { SubmitButton } from "./forms";
import { CustomPracticeFields } from "./custom-practice-fields";
import { DraftConflict, useDraftRevision } from "./draft-revision";
import Link from "./app-link";
export function CustomPracticeForm({ event }: { event: CalendarEvent }) {
  const { id, version, changed } = useDraftRevision(
    event.id.slice(7),
    event.version,
  );
  const [state, action] = useActionState(saveCustomPractice, { error: null });
  return (
    <form
      data-mutation-form
      action={action}
      className="panel stack"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <CustomPracticeFields event={event} disabled={changed} />
      <DraftConflict changed={changed} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <SubmitButton disabled={changed}>Save practice</SubmitButton>
        <Link className="button secondary" href="/calendar">
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function DeleteCustomPractice({ event }: { event: CalendarEvent }) {
  const [state, action] = useActionState(deleteCustomPractice, { error: null });
  return (
    <form
      data-mutation-form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete “${event.title}” from the calendar and cancel its pending reminders? Linked announcements will show that the practice was removed.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={event.id.slice(7)} />
      <input type="hidden" name="version" value={event.version} />
      <SubmitButton className="button secondary">Delete practice</SubmitButton>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
    </form>
  );
}
