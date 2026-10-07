import Link from "next/link";
import { calendarData } from "@/features/calendar/queries";
import { eventWhen, syncTime } from "@/features/calendar/types";
export async function CalendarHome() {
  const { calendar } = await calendarData();
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const events = calendar.events
    .filter((event) =>
      event.allDay ? event.end > today : Date.parse(event.end) > now.getTime(),
    )
    .slice(0, 3);
  return (
    <section className="panel my-segments">
      <div className="section-toolbar">
        <h2>Next practices</h2>
        <Link href="/calendar" className="text-button">
          View calendar →
        </Link>
      </div>
      {!calendar.configured ? (
        <p className="muted">The team calendar hasn’t been connected yet.</p>
      ) : (
        <>
          {calendar.stale && (
            <p className="notice">
              {calendar.unavailable
                ? "The schedule is temporarily unavailable."
                : "Showing the last saved schedule. Changes may not appear yet."}
            </p>
          )}
          {events.map((event) => (
            <div className="my-segment-row" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p className="small muted">
                  {eventWhen(event)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </div>
            </div>
          ))}
          {!events.length && !calendar.unavailable && (
            <p className="muted">
              No upcoming practices in the synced calendar window.
            </p>
          )}
          {calendar.lastSuccessAt && (
            <p className="small muted">
              Last synced {syncTime(calendar.lastSuccessAt)} · Central time
            </p>
          )}
        </>
      )}
    </section>
  );
}
