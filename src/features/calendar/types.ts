export const CALENDAR_ZONE = "America/Chicago" as const;
export const FRESHNESS_MS = 300_000;
export type CalendarEvent = {
  id: string;
  title: string;
  location: string | null;
  url: string | null;
  start: string;
  end: string;
  allDay: boolean;
  recurringEventId: string | null;
  originalStart: string | null;
};
export type CalendarSnapshot = {
  source_fingerprint: string;
  events: CalendarEvent[];
  last_success_at: string | null;
  last_error: string | null;
  lease_until: string | null;
  window_start: string | null;
  window_end: string | null;
};
export type CalendarView = {
  configured: boolean;
  events: CalendarEvent[];
  lastSuccessAt: string | null;
  stale: boolean;
  unavailable: boolean;
  refreshing: boolean;
  error: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  timeZone: typeof CALENDAR_ZONE;
};
export function viewFromSnapshot(
  snapshot: CalendarSnapshot | null,
  source: string | null,
  now = new Date(),
): CalendarView {
  const valid = snapshot?.source_fingerprint === source ? snapshot : null;
  const success = valid?.last_success_at ?? null;
  return {
    configured: source !== null,
    events: success ? valid!.events : [],
    lastSuccessAt: success,
    stale: !success || now.getTime() - Date.parse(success) >= FRESHNESS_MS,
    unavailable: !success,
    refreshing:
      !!valid?.lease_until && Date.parse(valid.lease_until) > now.getTime(),
    error: valid?.last_error ?? null,
    windowStart: valid?.window_start ?? null,
    windowEnd: valid?.window_end ?? null,
    timeZone: CALENDAR_ZONE,
  };
}
export function eventWhen(
  event: Pick<CalendarEvent, "allDay" | "start" | "end">,
): string {
  if (event.allDay) {
    const date = (value: string) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value + "T00:00:00Z"));
    const last = new Date(Date.parse(event.end + "T00:00:00Z") - 86400000)
      .toISOString()
      .slice(0, 10);
    return `${date(event.start)}${last !== event.start ? ` – ${date(last)}` : ""} · All day`;
  }
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const start = new Date(event.start),
    end = new Date(event.end);
  return `${date.format(start)} · ${time.format(start)} – ${date.format(start) !== date.format(end) ? date.format(end) + " · " : ""}${time.format(end)}`;
}
export function syncTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
