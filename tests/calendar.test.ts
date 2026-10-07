import { describe, expect, it, vi } from "vitest";
import {
  fetchCalendar,
  CalendarFailure,
} from "../src/features/calendar/google";
import { eventWhen, viewFromSnapshot } from "../src/features/calendar/types";
vi.mock("server-only", () => ({}));
const config = {
  calendarId: "private@group.calendar.google.com",
  clientId: "client",
  clientSecret: "secret",
  refreshToken: "refresh",
};
const now = new Date("2026-10-07T12:00:00Z");
const event = {
  id: "one",
  summary: "Practice",
  start: { dateTime: "2026-10-08T18:00:00-05:00" },
  end: { dateTime: "2026-10-08T20:00:00-05:00" },
};
function fake(pages: unknown[]) {
  return vi.fn<typeof fetch>(async () => Response.json(pages.shift()));
}
it("expands recurrence remotely, follows even empty pages, preserves dates and excludes cancellations", async () => {
  const fetch = fake([
    { access_token: "token" },
    { items: [], nextPageToken: "next", accessRole: "reader" },
    {
      items: [
        event,
        { id: "gone", status: "cancelled" },
        {
          id: "all",
          start: { date: "2026-10-09" },
          end: { date: "2026-10-11" },
          recurringEventId: "series",
          originalStartTime: { date: "2026-10-09" },
        },
      ],
    },
  ]);
  const result = await fetchCalendar(config, { fetch, now });
  expect(result.events).toHaveLength(2);
  expect(result.events[1]).toMatchObject({
    allDay: true,
    start: "2026-10-09",
    end: "2026-10-11",
    recurringEventId: "series",
  });
  const url = String(fetch.mock.calls[1]?.[0]);
  expect(url).toContain("singleEvents=true");
  expect(url).toContain("showDeleted=false");
});
it("never returns partial snapshots on malformed entries or truncated pagination", async () => {
  await expect(
    fetchCalendar(config, {
      fetch: fake([
        { access_token: "token" },
        { items: [event, { id: "bad" }] },
      ]),
      now,
    }),
  ).rejects.toBeInstanceOf(CalendarFailure);
  await expect(
    fetchCalendar(config, {
      fetch: fake([
        { access_token: "token" },
        ...Array.from({ length: 4 }, () => ({
          items: [],
          nextPageToken: "more",
        })),
      ]),
      now,
    }),
  ).rejects.toMatchObject({ code: "capacity" });
});
it("retries transient failures only once across the whole refresh", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "next" }))
    .mockResolvedValueOnce(new Response("", { status: 503 }));
  await expect(
    fetchCalendar(config, { fetch, now, sleep: async () => {} }),
  ).rejects.toMatchObject({ code: "upstream" });
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("does not retry revoked credentials or forbidden calendars", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("sensitive-provider-body", { status: 400 }),
    );
  await expect(fetchCalendar(config, { fetch, now })).rejects.toMatchObject({
    code: "authorization",
    message: "Calendar connection needs attention.",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects impossible all-day dates, mismatched kinds, and missing timezone offsets", async () => {
  for (const broken of [
    { start: { date: "2026-02-30" }, end: { date: "2026-03-02" } },
    { start: { date: "2026-10-08" }, end: event.end },
    { start: { dateTime: "2026-10-08T18:00:00" }, end: event.end },
  ]) {
    await expect(
      fetchCalendar(config, {
        fetch: fake([
          { access_token: "token" },
          { items: [{ ...event, ...broken }] },
        ]),
        now,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  }
});
it("labels date-only end exclusively and renders Chicago DST", () => {
  expect(
    eventWhen({ allDay: true, start: "2026-10-09", end: "2026-10-11" }),
  ).toContain("Oct 10");
  expect(
    eventWhen({
      allDay: false,
      start: "2026-03-08T08:00:00Z",
      end: "2026-03-08T09:00:00Z",
    }),
  ).toContain("3:00");
});
describe("snapshot presentation", () => {
  it("distinguishes initial unavailable, successful empty, stale fallback and mismatched sources", () => {
    expect(viewFromSnapshot(null, "source", now)).toMatchObject({
      unavailable: true,
      lastSuccessAt: null,
    });
    const snapshot = {
      source_fingerprint: "source",
      events: [],
      last_success_at: now.toISOString(),
      last_error: null,
      lease_until: null,
      window_start: now.toISOString(),
      window_end: now.toISOString(),
    };
    expect(viewFromSnapshot(snapshot, "source", now)).toMatchObject({
      unavailable: false,
      stale: false,
      events: [],
    });
    expect(
      viewFromSnapshot(snapshot, "source", new Date(now.getTime() + 301000)),
    ).toMatchObject({ stale: true, unavailable: false });
    expect(viewFromSnapshot(snapshot, "different", now)).toMatchObject({
      unavailable: true,
      lastSuccessAt: null,
      events: [],
    });
  });
});
it("aborts before requests and maps an interrupted request to a sanitized timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  const request = vi.fn<typeof fetch>();
  await expect(
    fetchCalendar(config, { fetch: request, signal: controller.signal }),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(request).not.toHaveBeenCalled();
  const running = new AbortController();
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    running.abort();
    throw new Error("network secret");
  });
  await expect(
    fetchCalendar(config, { fetch, signal: running.signal }),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects oversized responses and free-busy access", async () => {
  const oversized = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("x".repeat(2_000_001)));
  await expect(
    fetchCalendar(config, { fetch: oversized }),
  ).rejects.toMatchObject({ code: "capacity" });
  await expect(
    fetchCalendar(config, {
      fetch: fake([
        { access_token: "token" },
        { items: [], accessRole: "freeBusyReader" },
      ]),
    }),
  ).rejects.toMatchObject({ code: "authorization" });
});
it("recognizes Google's quota403 as transient, while403 forbidden is permanent", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(
      Response.json(
        { error: { errors: [{ reason: "rateLimitExceeded" }] } },
        { status: 403 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ items: [] }));
  expect(
    (await fetchCalendar(config, { fetch: request, sleep: async () => {} }))
      .events,
  ).toEqual([]);
  expect(request).toHaveBeenCalledTimes(3);
  const forbidden = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(new Response("", { status: 403 }));
  await expect(
    fetchCalendar(config, { fetch: forbidden }),
  ).rejects.toMatchObject({ code: "authorization" });
  expect(forbidden).toHaveBeenCalledTimes(2);
});
it("returns full replacements so moved or cancelled occurrences do not linger", async () => {
  const first = await fetchCalendar(config, {
    fetch: fake([
      { access_token: "token" },
      { items: [{ ...event, recurringEventId: "series" }] },
    ]),
    now,
  });
  const next = await fetchCalendar(config, {
    fetch: fake([
      { access_token: "token" },
      {
        items: [
          {
            ...event,
            id: "new",
            summary: "Changed",
            start: { dateTime: "2026-10-09T18:00:00-05:00" },
            end: { dateTime: "2026-10-09T20:00:00-05:00" },
          },
        ],
      },
    ]),
    now,
  });
  expect(first.events[0].id).toBe("one");
  expect(next.events.map((e) => e.id)).toEqual(["new"]);
  expect(next.events[0].title).toBe("Changed");
});
it("sorts repeated fall DST hours by instant and puts all-day entries first on their date", async () => {
  const result = await fetchCalendar(config, {
    fetch: fake([
      { access_token: "token" },
      {
        items: [
          {
            id: "later",
            start: { dateTime: "2026-11-01T01:15:00-06:00" },
            end: { dateTime: "2026-11-01T02:00:00-06:00" },
          },
          {
            id: "earlier",
            start: { dateTime: "2026-11-01T01:30:00-05:00" },
            end: { dateTime: "2026-11-01T02:00:00-06:00" },
          },
          {
            id: "all-day",
            start: { date: "2026-11-01" },
            end: { date: "2026-11-02" },
          },
        ],
      },
    ]),
    now,
  });
  expect(result.events.map((e) => e.id)).toEqual([
    "all-day",
    "earlier",
    "later",
  ]);
});
