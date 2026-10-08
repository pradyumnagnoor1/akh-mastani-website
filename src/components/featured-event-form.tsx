"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "./forms";
import {
  saveFeaturedEvent,
  deleteFeaturedEvent,
} from "@/features/featured-events/actions";
import type { FeaturedEvent } from "@/features/featured-events/types";
export function FeaturedEventForm({
  id,
  event,
}: {
  id: string;
  event?: FeaturedEvent;
}) {
  const [state, action] = useActionState(saveFeaturedEvent, { error: null });
  const [fields, setFields] = useState({
    title: event?.title ?? "",
    event_date: event?.event_date ?? "",
    start_time: event?.start_time?.slice(0, 5) ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    event_link: event?.event_link ?? "",
  });
  return (
    <form
      action={action}
      className="panel stack"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={event?.version ?? 0} />
      <label htmlFor="event-title">Event title</label>
      <input
        id="event-title"
        name="title"
        required
        maxLength={160}
        value={fields.title}
        onChange={(e) => setFields({ ...fields, title: e.target.value })}
      />
      <label htmlFor="event-day">Event date</label>
      <input
        id="event-day"
        name="event_date"
        type="date"
        required
        min="2000-01-01"
        max="2100-12-31"
        value={fields.event_date}
        onChange={(e) => setFields({ ...fields, event_date: e.target.value })}
      />
      <label htmlFor="event-time">Time (Central, optional)</label>
      <input
        id="event-time"
        name="start_time"
        type="time"
        value={fields.start_time}
        onChange={(e) => setFields({ ...fields, start_time: e.target.value })}
      />
      <p className="muted small">Leave time blank for an all-day event.</p>
      <label htmlFor="event-location">Location (optional)</label>
      <input
        id="event-location"
        name="location"
        maxLength={200}
        value={fields.location}
        onChange={(e) => setFields({ ...fields, location: e.target.value })}
      />
      <label htmlFor="event-details">Event details (optional)</label>
      <textarea
        id="event-details"
        name="description"
        rows={4}
        maxLength={3000}
        value={fields.description}
        onChange={(e) => setFields({ ...fields, description: e.target.value })}
      />
      <label htmlFor="event-link">Event link (optional)</label>
      <input
        id="event-link"
        name="event_link"
        type="url"
        maxLength={2048}
        value={fields.event_link}
        onChange={(e) => setFields({ ...fields, event_link: e.target.value })}
      />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <SubmitButton>
          {event ? "Save event" : "Create featured event"}
        </SubmitButton>
        <Link href="/calendar" className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function DeleteFeaturedEvent({ event }: { event: FeaturedEvent }) {
  const [state, action] = useActionState(deleteFeaturedEvent, { error: null });
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete “${event.title}” from the calendar?`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={event.id} />
      <input type="hidden" name="version" value={event.version} />
      <SubmitButton className="button secondary">Delete event</SubmitButton>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
    </form>
  );
}
