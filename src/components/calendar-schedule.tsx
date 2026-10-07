"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, ExternalLink } from "lucide-react";
import {
  eventWhen,
  syncTime,
  type CalendarView,
} from "@/features/calendar/types";
export function CalendarSchedule({ initial }: { initial: CalendarView }) {
  const [calendar, setCalendar] = useState(initial),
    [failure, setFailure] = useState(false),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible" || controller.current) return;
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      try {
        const response = await fetch("/api/calendar", {
          cache: "no-store",
          signal: AbortSignal.any([
            current.signal,
            AbortSignal.timeout(30_000),
          ]),
        });
        if (
          response.redirected ||
          response.status === 401 ||
          response.status === 403
        ) {
          setCalendar({
            ...initial,
            events: [],
            unavailable: true,
            lastSuccessAt: null,
          });
          window.location.assign(response.redirected ? response.url : "/login");
          return;
        }
        if (!response.ok) throw new Error("Calendar unavailable");
        const next = (await response.json()) as CalendarView;
        if (!current.signal.aborted) {
          setCalendar(next);
          setFailure(false);
        }
      } catch {
        if (!current.signal.aborted) setFailure(true);
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setBusy(false);
        }
      }
    }
    const timer = setInterval(() => {
      void refresh();
    }, 300_000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      controller.current?.abort();
      controller.current = null;
    };
  }, [initial]);
  const now = new Date();
  const chicagoToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const allUpcoming = calendar.events.filter((event) =>
    event.allDay
      ? event.end > chicagoToday
      : Date.parse(event.end) > now.getTime(),
  );
  const upcoming = allUpcoming.slice(0, 10);
  const past = calendar.events
    .filter((event) => !allUpcoming.includes(event))
    .reverse()
    .slice(0, 10 - upcoming.length);
  function events(items: typeof upcoming) {
    return (
      <div className="calendar-list">
        {items.map((event) => (
          <article key={event.id} className="panel calendar-event">
            <div className="calendar-event-icon" aria-hidden="true">
              <CalendarDays size={22} />
            </div>
            <div className="calendar-event-content">
              <p className="eyebrow">{eventWhen(event)}</p>
              <h2>{event.title}</h2>
              {event.location && (
                <p className="muted calendar-location">
                  <MapPin size={15} aria-hidden="true" />
                  {event.location}
                </p>
              )}
              {event.recurringEventId && (
                <span className="badge">Recurring practice</span>
              )}
            </div>
            {event.url && (
              <a
                className="button secondary calendar-google-link"
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Calendar <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </article>
        ))}
      </div>
    );
  }
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
            : busy || calendar.refreshing
              ? "Checking for changes"
              : failure || calendar.stale
                ? "Updates delayed"
                : "Up to date"}
        </span>
      </section>
      {!calendar.configured ? (
        <section className="panel calendar-empty">
          <CalendarDays size={32} aria-hidden="true" />
          <h2>Calendar connection coming soon</h2>
          <p className="muted">
            The team calendar has not been connected yet. Your admin will finish
            setup.
          </p>
        </section>
      ) : calendar.unavailable ? (
        <section className="panel calendar-empty">
          <CalendarDays size={32} aria-hidden="true" />
          <h2>Schedule temporarily unavailable</h2>
          <p className="muted">
            We haven’t loaded the team schedule yet. Check back shortly.
          </p>
        </section>
      ) : (
        <>
          {(calendar.stale || calendar.error || failure) && (
            <p className="notice" role="status">
              Updates are delayed. Showing the last saved schedule; check Google
              Calendar for recent changes.
            </p>
          )}
          <div className="section-heading">
            <h2>Coming up</h2>
            <span className="muted small">
              {upcoming.length} {upcoming.length === 1 ? "event" : "events"}
            </span>
          </div>
          {upcoming.length ? (
            events(upcoming)
          ) : (
            <section className="panel calendar-empty">
              <CalendarDays size={32} aria-hidden="true" />
              <h2>No upcoming practices</h2>
              <p className="muted">
                There are no upcoming events in the connected calendar within
                the next 180 days.
              </p>
            </section>
          )}
          {past.length > 0 && (
            <details className="calendar-past">
              <summary>Earlier practices ({past.length})</summary>
              {events(past)}
            </details>
          )}
        </>
      )}
      <p className="muted small calendar-footnote">
        Schedule changes are made in Google Calendar. This page checks for
        updates every five minutes while open and when you return.
      </p>
    </>
  );
}
