"use client";
import { useState } from "react";
import type { CommunicationPost } from "@/features/communication/types";
import { reminderFields } from "@/features/notifications/reminder-policy";
export function AnnouncementReminderFields({
  post,
  tasks,
  disabled,
}: {
  post?: CommunicationPost;
  tasks: CommunicationPost[];
  disabled: boolean;
}) {
  const [enabled, setEnabled] = useState(!!post?.reminder_at);
  const [mode, setMode] = useState(post?.reminder_mode ?? "acknowledgment");
  const initial = reminderFields(post?.reminder_at);
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time);
  const [message, setMessage] = useState(post?.reminder_message ?? "");
  const [task, setTask] = useState(post?.reminder_task_id ?? "");
  return (
    <section className="panel stack">
      <label className="reminder-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Add a reminder
      </label>
      <input type="hidden" name="reminder_enabled" value={String(enabled)} />
      {enabled && (
        <>
          <div className="reminder-time-fields">
            <div className="stack">
              <label htmlFor="reminder-date">Reminder date</label>
              <input
                id="reminder-date"
                name="reminder_date"
                type="date"
                value={date}
                required
                disabled={disabled}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="stack">
              <label htmlFor="reminder-time">Reminder time (Texas)</label>
              <input
                id="reminder-time"
                name="reminder_time"
                type="time"
                value={time}
                required
                disabled={disabled}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <p className="muted small">
            Quiet hours are 10 PM–9 AM Texas time. Reminders scheduled then wait
            until 9 AM, if still relevant.
          </p>
          <label htmlFor="reminder-mode">When should this reminder stop?</label>
          <select
            id="reminder-mode"
            name="reminder_mode"
            value={mode}
            disabled={disabled}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="acknowledgment">Once the dancer acknowledges</option>
            <option value="preparation">Send even after acknowledgment</option>
            <option value="linked-task">
              Once a linked to-do is completed
            </option>
          </select>
          {mode === "linked-task" && (
            <>
              <label htmlFor="reminder-task">Linked to-do</label>
              <select
                id="reminder-task"
                name="reminder_task_id"
                value={task}
                required
                disabled={disabled}
                onChange={(e) => setTask(e.target.value)}
              >
                <option value="">Choose a to-do</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="muted small">
                Only dancers assigned both this announcement and the to-do
                receive the reminder.
              </p>
            </>
          )}
          <label htmlFor="reminder-message">Reminder message (optional)</label>
          <input
            id="reminder-message"
            name="reminder_message"
            value={message}
            disabled={disabled}
            maxLength={200}
            placeholder="Bring black shoes to practice"
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="muted small">
            Shown in the announcement and reminder preview. If blank, the
            reminder uses your announcement message.
          </p>
        </>
      )}
    </section>
  );
}
