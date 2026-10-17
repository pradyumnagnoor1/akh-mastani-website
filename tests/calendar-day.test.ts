import { expect, it } from "vitest";
import {
  eventOnDay,
  eventStatus,
  practiceIdentity,
  chicagoDay,
  moveDay,
  validDay,
} from "../src/features/calendar/day";
import type { CalendarEvent } from "../src/features/calendar/types";
const base: CalendarEvent = {
  id: "event",
  title: "Practice",
  start: "2026-10-17T04:30:00Z",
  end: "2026-10-17T06:30:00Z",
  allDay: false,
  location: null,
  url: null,
  recurringEventId: null,
  originalStart: null,
};
it("includes overnight practices on both Chicago dates with exclusive end", () => {
  expect(eventOnDay(base, "2026-10-16")).toBe(true);
  expect(eventOnDay(base, "2026-10-17")).toBe(true);
  expect(eventOnDay(base, "2026-10-18")).toBe(false);
  expect(
    eventOnDay({ ...base, end: "2026-10-17T05:00:00Z" }, "2026-10-17"),
  ).toBe(false);
});
it("handles all-day spans, DST boundaries, day navigation and event statuses", () => {
  expect(
    eventOnDay(
      { ...base, allDay: true, start: "2026-10-16", end: "2026-10-18" },
      "2026-10-17",
    ),
  ).toBe(true);
  expect(
    eventOnDay(
      { ...base, allDay: true, start: "2026-10-16", end: "2026-10-18" },
      "2026-10-18",
    ),
  ).toBe(false);
  expect(
    eventOnDay(
      { ...base, start: "2026-11-01T06:30:00Z", end: "2026-11-01T08:00:00Z" },
      "2026-11-01",
    ),
  ).toBe(true);
  expect(chicagoDay(new Date("2026-10-17T04:00:00Z"))).toBe("2026-10-16");
  expect(moveDay("2026-12-31", 1)).toBe("2027-01-01");
  expect(validDay("2026-02-30")).toBe(false);
  expect(validDay("2026-10-16")).toBe(true);
  expect(eventStatus(base, new Date("2026-10-17T03:00:00Z"))).toBe("Upcoming");
  expect(eventStatus(base, new Date("2026-10-17T05:00:00Z"))).toBe(
    "Happening now",
  );
  expect(eventStatus(base, new Date(base.end))).toBe("Ended");
});
it("keeps recurring instance identity across moves while distinguishing occurrences", () => {
  const event = {
    ...base,
    recurringEventId: "weekly",
    originalStart: base.start,
  };
  expect(practiceIdentity(event)).toBe(
    practiceIdentity({ ...event, start: "2026-10-18T04:30:00Z" }),
  );
  expect(
    practiceIdentity({ ...event, originalStart: "2026-10-24T04:30:00Z" }),
  ).not.toBe(practiceIdentity(event));
});
