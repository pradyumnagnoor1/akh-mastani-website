"use client";
import { useEffect, useState } from "react";
import Link from "./app-link";
import { CalendarDays, MapPin, ExternalLink } from "lucide-react";
import {
  eventWhen,
  syncTime,
  type CalendarView,
  type CalendarEvent,
} from "@/features/calendar/types";
import {
  chicagoDay,
  eventOnDay,
  eventStatus,
  moveDay,
  practiceIdentity,
  validDay,
} from "@/features/calendar/day";
import { chicagoReminderTime } from "@/features/notifications/reminder-policy";
import { featuredWhen } from "@/features/featured-events/types";
import type { FeaturedEvent } from "@/features/featured-events/types";
import type { CommunicationPost } from "@/features/communication/types";
import { ReadBadge } from "./read-badge";
import { CommunicationAttribution } from "./communication-attribution";
import { MessageText } from "./message-text";
import { DeleteCustomPractice } from "./custom-practice-form";
import { DeleteFeaturedEvent } from "./featured-event-form";

type ScheduleItem = { event: CalendarEvent; featured?: FeaturedEvent };
export function CalendarSchedule({
  initial: calendar,
  featured = [],
  announcements = [],
  admin = false,
  initialDay,
  serverNow,
}: {
  initial: CalendarView;
  featured?: FeaturedEvent[];
  announcements?: CommunicationPost[];
  admin?: boolean;
  initialDay?: string;
  serverNow?: string;
}) {
  const [now, setNow] = useState(
    () => new Date(serverNow ?? new Date().toISOString()),
  );
  const [day, setDay] = useState(
    initialDay && validDay(initialDay) ? initialDay : chicagoDay(now),
  );
  const [view, setView] = useState<"day" | "upcoming">("day");
  useEffect(() => {
    let previousToday = chicagoDay();
    const timer = setInterval(() => {
      const current = new Date();
      const nextToday = chicagoDay(current);
      if (nextToday !== previousToday) {
        const prior = previousToday;
        setDay((selected) => (selected === prior ? nextToday : selected));
        previousToday = nextToday;
      }
      setNow(current);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  const today = chicagoDay(now);
  const items: ScheduleItem[] = [
    ...calendar.events.map((event) => ({ event })),
    ...featured
      .filter(
        (e) =>
          !e.deleted_at &&
          (!e.expires_at || Date.parse(e.expires_at) > now.getTime()),
      )
      .map((e) => {
        let start = e.event_date;
        if (e.start_time) {
          // Featured times are Chicago local time. Ambiguous DST times retain day membership.
          try {
            start = chicagoReminderTime(e.event_date, e.start_time.slice(0, 5));
          } catch {
            start = `${e.event_date}T${e.start_time}-06:00`;
          }
        }
        return {
          featured: e,
          event: {
            id: `featured-${e.id}`,
            title: e.title,
            start,
            end: e.start_time ? start : moveDay(e.event_date, 1),
            allDay: !e.start_time,
            location: e.location || null,
            url: e.event_link || null,
            recurringEventId: null,
            originalStart: null,
          },
        };
      }),
  ].sort((a, b) => {
    const date = (e: CalendarEvent) =>
      e.allDay
        ? `${e.start}T00:00`
        : `${chicagoDay(new Date(e.start))}T${new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(e.start))}`;
    return (
      date(a.event).localeCompare(date(b.event)) ||
      a.event.id.localeCompare(b.event.id)
    );
  });
  const upcoming = items.filter(({ event, featured }) =>
    featured
      ? featured.event_date >= today
      : event.allDay
        ? event.end > today
        : Date.parse(event.end) > now.getTime(),
  );
  const visible =
    view === "day"
      ? items.filter(({ event, featured }) =>
          featured ? featured.event_date === day : eventOnDay(event, day),
        )
      : upcoming;
  const next = upcoming[0];
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
  return (
    <>
      <section
        className="panel calendar-status"
        aria-label="Calendar synchronization status"
        aria-live="polite"
      >
        <div>
          <strong>Team Google Calendar</strong>
          <p className="muted small">
            America/Chicago · Past 30 days and next 180 days
          </p>
          <p className="muted small">
            {calendar.lastSuccessAt
              ? `Last updated ${syncTime(calendar.lastSuccessAt)}`
              : "No successful sync yet."}
          </p>
        </div>
        <span className="badge">
          {!calendar.configured
            ? "Not connected"
            : calendar.refreshing
              ? "Checking for changes"
              : calendar.stale
                ? "Updates delayed"
                : "Up to date"}
        </span>
      </section>
      {(calendar.stale || calendar.error) && calendar.configured && (
        <p className="notice" role="status">
          Updates are delayed. Showing the last saved schedule; check Google
          Calendar for recent changes.
        </p>
      )}
      {!calendar.configured && (
        <section className="panel stack">
          <h2>Calendar connection coming soon</h2>
          <p className="muted">
            The team calendar has not been connected yet. Featured events are
            shown below.
          </p>
        </section>
      )}
      {calendar.configured && calendar.unavailable && (
        <section className="panel stack">
          <h2>Schedule temporarily unavailable</h2>
          <p className="muted">
            We haven’t loaded the team schedule yet. Check back shortly.
          </p>
        </section>
      )}
      <section
        className="panel calendar-day-controls"
        aria-label="Choose calendar day"
      >
        <div className="actions" role="group" aria-label="Calendar view">
          <button
            className={`button ${view === "day" ? "primary" : "secondary"}`}
            aria-pressed={view === "day"}
            onClick={() => setView("day")}
          >
            Day
          </button>
          <button
            className={`button ${view === "upcoming" ? "primary" : "secondary"}`}
            aria-pressed={view === "upcoming"}
            onClick={() => setView("upcoming")}
          >
            Upcoming
          </button>
        </div>
        <div className="actions">
          <button
            className="button secondary"
            aria-label="Previous day"
            disabled={day === "2000-01-01"}
            onClick={() => {
              setDay(moveDay(day, -1));
              setView("day");
            }}
          >
            ←
          </button>
          <label className="stack small">
            Date
            <input
              type="date"
              value={day}
              min="2000-01-01"
              max="2100-12-31"
              onChange={(e) => {
                if (validDay(e.target.value)) {
                  setDay(e.target.value);
                  setView("day");
                }
              }}
            />
          </label>
          <button
            className="button secondary"
            aria-label="Next day"
            disabled={day === "2100-12-31"}
            onClick={() => {
              setDay(moveDay(day, 1));
              setView("day");
            }}
          >
            →
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setDay(today);
              setView("day");
            }}
          >
            Today
          </button>
        </div>
      </section>
      <div className="section-heading">
        <h2>
          {view === "day"
            ? `${day === today ? "Today · " : ""}${dateLabel}`
            : "Coming up"}
        </h2>
        <span className="muted small">
          {visible.length} {visible.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="calendar-list">
        {visible.map(({ event, featured: custom }) => {
          const notes = custom
            ? []
            : announcements.filter(
                (p) =>
                  p.kind === "announcement" &&
                  p.practice_source === (event.source ?? calendar.source) &&
                  p.practice_event_id === practiceIdentity(event) &&
                  (!p.expires_at || Date.parse(p.expires_at) > now.getTime()),
              );
          return (
            <article
              key={event.id}
              id={`event-${event.id}`}
              className="panel calendar-event"
            >
              <div className="calendar-event-icon" aria-hidden="true">
                <CalendarDays size={22} />
              </div>
              <div className="calendar-event-content">
                <p className="eyebrow">
                  {custom?.start_time ? featuredWhen(custom) : eventWhen(event)}
                </p>
                <h2>{event.title}</h2>
                <span
                  className={`badge ${eventStatus(event, now) === "Happening now" ? "success" : ""}`}
                >
                  {custom?.start_time
                    ? Date.parse(event.start) <= now.getTime()
                      ? "Started"
                      : "Upcoming"
                    : eventStatus(event, now)}
                </span>
                {custom && <span className="badge">Featured event</span>}
                {event.location && (
                  <p className="muted calendar-location">
                    <MapPin size={15} aria-hidden="true" />
                    {event.location}
                  </p>
                )}
                {event.source === "custom" && (
                  <span className="badge">Custom practice</span>
                )}
                {event.recurringEventId && (
                  <span className="badge">Recurring practice</span>
                )}
                {custom?.description && (
                  <p className="preserve-lines">
                    <MessageText text={custom.description} />
                  </p>
                )}
                {notes.length > 0 && (
                  <section
                    className="practice-notes"
                    aria-label={`Announcements for ${event.title}`}
                  >
                    <h3>Practice announcements</h3>
                    {notes.map((post) => (
                      <div className="practice-note" key={post.id}>
                        <Link href={`/announcements/${post.id}`}>
                          <strong>{post.title}</strong>
                        </Link>
                        <CommunicationAttribution post={post} />
                        {post.viewer_read !== undefined && (
                          <ReadBadge read={post.viewer_read} />
                        )}
                        <p className="preserve-lines">
                          <MessageText text={post.body} />
                        </p>
                      </div>
                    ))}
                  </section>
                )}
                {event.source === "custom" && admin && (
                  <div className="actions">
                    <Link
                      className="button secondary"
                      href={`/calendar/practices/${event.id.slice(7)}/edit`}
                    >
                      Edit practice
                    </Link>
                    <DeleteCustomPractice event={event} />
                  </div>
                )}
                {custom && admin && (
                  <div className="actions">
                    <Link
                      href={`/calendar/featured/${custom.id}/edit`}
                      className="button secondary"
                    >
                      Edit event
                    </Link>
                    <DeleteFeaturedEvent event={custom} />
                  </div>
                )}
              </div>
              {event.url && (
                <a
                  className="button secondary calendar-google-link"
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {custom ? "Event details" : "Google Calendar"}
                  <ExternalLink size={14} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <section className="panel calendar-empty">
          <CalendarDays size={32} aria-hidden="true" />
          <h2>
            {view === "day"
              ? day === today
                ? "No events today"
                : "No events on this day"
              : "No upcoming events"}
          </h2>
          {next && view === "day" && (
            <>
              <p className="muted">
                Next: {next.event.title} · {eventWhen(next.event)}
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  setDay(
                    next.featured?.event_date ??
                      (next.event.allDay
                        ? next.event.start
                        : chicagoDay(new Date(next.event.start))),
                  )
                }
              >
                View next event
              </button>
            </>
          )}
        </section>
      )}
      <p className="muted small calendar-footnote">
        Google Calendar changes sync every five minutes. Exec members can edit
        custom practices here. Linked practice announcements share the practice
        reminder.
      </p>
    </>
  );
}
