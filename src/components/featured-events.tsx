/* eslint-disable react-hooks/purity -- Server components capture request time for expiration timers. */
import { Expires } from "./expires";
import Link from "next/link";
import { featuredData } from "@/features/featured-events/queries";
import { featuredWhen } from "@/features/featured-events/types";
import { DeleteFeaturedEvent } from "./featured-event-form";
export async function FeaturedEvents({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { member, events } = await featuredData();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const active = events.filter((e) => !e.deleted_at && e.event_date >= today);
  if (compact && !active.length) return null;
  const visible = compact ? active.slice(0, 3) : active;
  return (
    <section
      className={
        compact ? "panel stack featured-events" : "stack featured-events"
      }
      aria-label="Featured events"
    >
      <div className="section-toolbar">
        <h2>Featured events</h2>
        {!compact && member.is_admin && (
          <Link href="/calendar/featured/new" className="button primary">
            Add featured event
          </Link>
        )}
        {compact && (
          <Link href="/calendar" className="text-button">
            View calendar →
          </Link>
        )}
      </div>
      {!visible.length && <p className="muted">No upcoming featured events.</p>}
      {visible.map((event) => (
        <Expires key={event.id} at={event.expires_at} serverNow={Date.now()}>
          <article className={compact ? "stack" : "panel stack"}>
            <p className="eyebrow">{featuredWhen(event)}</p>
            <h3>{event.title}</h3>
            {event.location && <p className="muted">{event.location}</p>}
            {!compact && event.description && (
              <p className="preserve-lines">{event.description}</p>
            )}
            {!compact && event.event_link && (
              <a
                className="text-button"
                href={event.event_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Event details{" "}
                <span className="sr-only">(opens in a new tab)</span>→
              </a>
            )}
            {!compact && member.is_admin && (
              <div className="actions">
                <Link
                  href={`/calendar/featured/${event.id}/edit`}
                  className="button secondary"
                >
                  Edit event
                </Link>
                <DeleteFeaturedEvent event={event} />
              </div>
            )}
          </article>
        </Expires>
      ))}
      {!compact &&
        member.is_admin &&
        events.some((e) => !e.deleted_at && e.event_date < today) && (
          <details>
            <summary>Past featured events</summary>
            {events
              .filter((e) => !e.deleted_at && e.event_date < today)
              .map((event) => (
                <Expires
                  key={event.id}
                  at={event.expires_at}
                  serverNow={Date.now()}
                >
                  <article className="panel stack">
                    <h3>{event.title}</h3>
                    <p className="muted">{featuredWhen(event)}</p>
                    <div className="actions">
                      <Link
                        className="button secondary"
                        href={`/calendar/featured/${event.id}/edit`}
                      >
                        Edit event
                      </Link>
                      <DeleteFeaturedEvent event={event} />
                    </div>
                  </article>
                </Expires>
              ))}
          </details>
        )}
    </section>
  );
}
