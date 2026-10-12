"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2 } from "lucide-react";
import type { buildDigest } from "@/features/digest/policy";
export function TodayCard({
  digest,
  unavailable,
  calendarStale,
}: {
  digest: ReturnType<typeof buildDigest>;
  unavailable: string[];
  calendarStale: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? digest.items : digest.items.slice(0, 5);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${digest.today}T12:00:00Z`));
  const schedules = digest.schedule.length
    ? digest.schedule
    : digest.next
      ? [digest.next]
      : [];
  return (
    <section className="panel today-card" aria-labelledby="today-heading">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">YOUR DAILY PLAN</p>
          <h2 id="today-heading">Today · {date}</h2>
        </div>
        <span className="badge">For you</span>
      </div>
      {!digest.schedule.length && digest.next && (
        <p className="eyebrow">NEXT UP</p>
      )}
      {schedules.length > 0 && (
        <div className="today-schedule">
          {schedules.map((event) => (
            <Link key={event.id} href={event.href} className="today-event">
              <CalendarDays size={20} />
              <span>
                <strong>{event.title}</strong>
                <small>
                  {event.day !== digest.today ? `${event.day} · ` : ""}
                  {event.detail}
                </small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      )}
      {calendarStale && (
        <p className="muted small">
          Practice schedule updates are delayed. Check the calendar for its last
          update.
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="notice error" role="status">
          Some updates could not be loaded: {unavailable.join(", ")}. Refresh to
          try again.
        </p>
      )}
      {!digest.items.length && !unavailable.length && (
        <p className="today-caught-up">
          <CheckCircle2 size={20} />
          You’re caught up.
        </p>
      )}
      {(["Needs attention", "Announcements", "Your updates"] as const).map(
        (section) => {
          const items = visible.filter((i) => i.section === section);
          return items.length ? (
            <div className="today-section" key={section}>
              <h3>{section}</h3>
              {items.map((item) => (
                <Link key={item.id} href={item.href} className="today-item">
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                    {section === "Announcements" && (
                      <span className="today-read-more">Read more →</span>
                    )}
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            </div>
          ) : null;
        },
      )}
      {digest.items.length > 5 && (
        <button
          type="button"
          className="button secondary small"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `View all ${digest.items.length} updates`}
        </button>
      )}
      {digest.awaitingVerification > 0 && (
        <p className="muted small today-verification">
          <Link href="/payments">
            {digest.awaitingVerification} payment{" "}
            {digest.awaitingVerification === 1 ? "report is" : "reports are"}{" "}
            awaiting verification
          </Link>{" "}
          · No payment action needed.
        </p>
      )}
    </section>
  );
}
