import "server-only";
// Dependency-injected core; only the queries module supplies credentials.
import { CALENDAR_ZONE, type CalendarEvent } from "./types";
export type CalendarConfig = {
  calendarId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};
export type FailureCode =
  "authorization" | "upstream" | "timeout" | "invalid_response" | "capacity";
export class CalendarFailure extends Error {
  constructor(public readonly code: FailureCode) {
    super(
      code === "authorization"
        ? "Calendar connection needs attention."
        : "Calendar refresh is temporarily unavailable.",
    );
  }
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const optionalText = (x: unknown, max: number): string | null =>
  typeof x === "string" ? x.slice(0, max) : null;
function validDate(x: unknown): x is string {
  return (
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    Number.isFinite(Date.parse(x)) &&
    new Date(x).toISOString().slice(0, 10) === x
  );
}
function validInstant(x: unknown): x is string {
  return (
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      x,
    ) &&
    Number.isFinite(Date.parse(x)) &&
    validDate(x.slice(0, 10))
  );
}
function normalize(item: unknown): CalendarEvent | null {
  if (
    !object(item) ||
    typeof item.id !== "string" ||
    !item.id ||
    item.id.length > 1024
  )
    throw new CalendarFailure("invalid_response");
  if (item.status === "cancelled") return null;
  if (
    item.status !== undefined &&
    item.status !== "confirmed" &&
    item.status !== "tentative"
  )
    throw new CalendarFailure("invalid_response");
  if (!object(item.start) || !object(item.end))
    throw new CalendarFailure("invalid_response");
  const allDay = validDate(item.start.date) && validDate(item.end.date);
  const start = allDay ? item.start.date : item.start.dateTime;
  const end = allDay ? item.end.date : item.end.dateTime;
  if (
    (!allDay &&
      (!validInstant(start) ||
        !validInstant(end) ||
        item.start.date !== undefined ||
        item.end.date !== undefined)) ||
    (allDay &&
      (item.start.dateTime !== undefined || item.end.dateTime !== undefined)) ||
    typeof start !== "string" ||
    typeof end !== "string" ||
    Date.parse(end) <= Date.parse(start)
  )
    throw new CalendarFailure("invalid_response");
  let url: string | null = null;
  if (typeof item.htmlLink === "string")
    try {
      const parsed = new URL(item.htmlLink);
      if (
        parsed.protocol === "https:" &&
        ["calendar.google.com", "www.google.com"].includes(parsed.hostname)
      )
        url = parsed.href;
    } catch {}
  const original = object(item.originalStartTime)
    ? (item.originalStartTime.date ?? item.originalStartTime.dateTime)
    : null;
  return {
    id: item.id,
    title: optionalText(item.summary, 500) || "Practice event",
    location: optionalText(item.location, 1000),
    url,
    start,
    end,
    allDay,
    recurringEventId: optionalText(item.recurringEventId, 1024),
    originalStart:
      validDate(original) || validInstant(original) ? original : null,
  };
}
export async function fetchCalendar(
  config: CalendarConfig,
  options: {
    fetch?: typeof fetch;
    now?: Date;
    sleep?: (ms: number) => Promise<void>;
    signal?: AbortSignal;
  } = {},
) {
  const request = options.fetch ?? fetch,
    now = options.now ?? new Date();
  const deadline = AbortSignal.timeout(15_000),
    signal = options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
  let retried = false;
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new CalendarFailure("timeout"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, ms);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }));
  async function json(
    url: string,
    init: RequestInit,
    token = false,
  ): Promise<Record<string, unknown>> {
    for (;;) {
      signal.throwIfAborted();
      let response: Response;
      try {
        response = await request(url, {
          ...init,
          signal,
          cache: "no-store",
          redirect: "error",
        });
      } catch {
        if (signal.aborted) throw new CalendarFailure("timeout");
        if (!retried) {
          retried = true;
          await sleep(200 + Math.random() * 200);
          continue;
        }
        throw new CalendarFailure("upstream");
      }
      let body: unknown;
      try {
        const reader = response.body?.getReader();
        let text = "",
          bytes = 0;
        if (reader) {
          const decoder = new TextDecoder();
          try {
            for (;;) {
              signal.throwIfAborted();
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 2_000_000) {
                void reader.cancel();
                throw new CalendarFailure("capacity");
              }
              text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            reader.releaseLock();
          }
        }
        body = text ? JSON.parse(text) : {};
      } catch (error) {
        if (signal.aborted) throw new CalendarFailure("timeout");
        if (error instanceof CalendarFailure) throw error;
        if (response.ok) throw new CalendarFailure("invalid_response");
        body = {};
      }
      if (!response.ok) {
        const reasons =
          object(body) && object(body.error) && Array.isArray(body.error.errors)
            ? body.error.errors.filter(object).map((e) => e.reason)
            : [];
        const transient =
          response.status === 429 ||
          response.status >= 500 ||
          (response.status === 403 &&
            reasons.some(
              (r) => r === "rateLimitExceeded" || r === "userRateLimitExceeded",
            ));
        if (transient && !retried) {
          retried = true;
          await sleep(200 + Math.random() * 200);
          continue;
        }
        throw new CalendarFailure(
          transient
            ? "upstream"
            : token || [401, 403, 404].includes(response.status)
              ? "authorization"
              : "upstream",
        );
      }
      if (!object(body)) throw new CalendarFailure("invalid_response");
      return body;
    }
  }
  try {
    const auth = await json(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }),
      },
      true,
    );
    if (typeof auth.access_token !== "string" || !auth.access_token)
      throw new CalendarFailure("invalid_response");
    const windowStart = new Date(now.getTime() - 30 * 86400000).toISOString(),
      windowEnd = new Date(now.getTime() + 180 * 86400000).toISOString();
    const events: CalendarEvent[] = [],
      ids = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page++) {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`,
      );
      url.search = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "false",
        orderBy: "startTime",
        timeMin: windowStart,
        timeMax: windowEnd,
        maxResults: "250",
        timeZone: CALENDAR_ZONE,
        fields:
          "timeZone,accessRole,nextPageToken,items(id,status,summary,location,htmlLink,start,end,recurringEventId,originalStartTime)",
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const body = await json(url.href, {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (
        body.accessRole !== undefined &&
        !["reader", "writer", "writerWithoutPrivateAccess", "owner"].includes(
          String(body.accessRole),
        )
      )
        throw new CalendarFailure("authorization");
      if (body.items !== undefined && !Array.isArray(body.items))
        throw new CalendarFailure("invalid_response");
      if (
        body.nextPageToken !== undefined &&
        (typeof body.nextPageToken !== "string" || !body.nextPageToken)
      )
        throw new CalendarFailure("invalid_response");
      const items = (body.items ?? []) as unknown[];
      if (items.length > 250 || events.length + items.length > 1000)
        throw new CalendarFailure("capacity");
      for (const item of items) {
        const event = normalize(item);
        if (event) {
          if (ids.has(event.id)) throw new CalendarFailure("invalid_response");
          ids.add(event.id);
          events.push(event);
        }
      }
      pageToken = body.nextPageToken as string | undefined;
      if (!pageToken) {
        const day = (event: CalendarEvent) =>
          event.allDay
            ? event.start
            : new Intl.DateTimeFormat("en-CA", {
                timeZone: CALENDAR_ZONE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(event.start));
        events.sort(
          (a, b) =>
            day(a).localeCompare(day(b)) ||
            (a.allDay !== b.allDay
              ? a.allDay
                ? -1
                : 1
              : a.allDay
                ? 0
                : Date.parse(a.start) - Date.parse(b.start)) ||
            a.id.localeCompare(b.id),
        );
        return { events, windowStart, windowEnd };
      }
    }
    throw new CalendarFailure("capacity");
  } catch (error) {
    if (signal.aborted) throw new CalendarFailure("timeout");
    throw error;
  }
}
