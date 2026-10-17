"use client";
import { useState } from "react";
import { practiceFields } from "@/features/custom-practices/policy";
import type { CalendarEvent } from "@/features/calendar/types";
export function CustomPracticeFields({
  event,
  disabled = false,
}: {
  event?: CalendarEvent | null;
  disabled?: boolean;
}) {
  const [fields, setFields] = useState(() => practiceFields(event));
  return (
    <fieldset className="custom-practice-fields stack" disabled={disabled}>
      <legend>Custom practice details</legend>
      <p className="muted small">
        Appears on the team’s website calendar. Times are in Texas time.
      </p>
      <label htmlFor="custom-title">Practice name</label>
      <input
        id="custom-title"
        name="custom_title"
        value={fields.title}
        required
        maxLength={160}
        onChange={(e) => setFields({ ...fields, title: e.target.value })}
      />
      <div className="practice-time-grid">
        <div className="stack">
          <label htmlFor="custom-date">Practice date</label>
          <input
            id="custom-date"
            type="date"
            name="custom_date"
            value={fields.date}
            required
            onChange={(e) =>
              setFields({
                ...fields,
                date: e.target.value,
                endDate:
                  fields.endDate === fields.date || !fields.endDate
                    ? e.target.value
                    : fields.endDate,
              })
            }
          />
        </div>
        <div className="stack">
          <label htmlFor="custom-start">Start time (Texas)</label>
          <input
            id="custom-start"
            type="time"
            name="custom_start"
            value={fields.start}
            required
            onChange={(e) => setFields({ ...fields, start: e.target.value })}
          />
        </div>
        <div className="stack">
          <label htmlFor="custom-end-date">End date</label>
          <input
            id="custom-end-date"
            type="date"
            name="custom_end_date"
            value={fields.endDate}
            required
            onChange={(e) => setFields({ ...fields, endDate: e.target.value })}
          />
        </div>
        <div className="stack">
          <label htmlFor="custom-end">End time (Texas)</label>
          <input
            id="custom-end"
            type="time"
            name="custom_end"
            value={fields.end}
            required
            onChange={(e) => setFields({ ...fields, end: e.target.value })}
          />
        </div>
      </div>
      <label htmlFor="custom-location">Practice location</label>
      <input
        id="custom-location"
        name="custom_location"
        value={fields.location}
        required
        maxLength={200}
        onChange={(e) => setFields({ ...fields, location: e.target.value })}
      />
    </fieldset>
  );
}
