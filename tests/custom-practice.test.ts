import { expect, it } from "vitest";
import {
  validateCustomPractice,
  customPracticeEvent,
} from "../src/features/custom-practices/policy";
import { notificationPath } from "../src/features/notifications/policy";
function form(changes: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    custom_title: "Extra practice",
    custom_location: "PEAP",
    custom_date: "2026-10-20",
    custom_start: "23:00",
    custom_end_date: "2026-10-21",
    custom_end: "01:00",
    ...changes,
  }))
    f.set(k, v);
  return f;
}
it("validates overnight Chicago times and rejects backwards, ambiguous, missing and oversized details", () => {
  const args = validateCustomPractice(form());
  expect(Date.parse(args.custom_end) - Date.parse(args.custom_start)).toBe(
    7200000,
  );
  expect(() =>
    validateCustomPractice(form({ custom_end_date: "2026-10-20" })),
  ).toThrow(/end after/);
  expect(() =>
    validateCustomPractice(
      form({ custom_date: "2026-11-01", custom_start: "01:30" }),
    ),
  ).toThrow(/daylight/);
  expect(() => validateCustomPractice(form({ custom_location: "" }))).toThrow(
    /location/,
  );
  expect(() =>
    validateCustomPractice(form({ custom_title: "x".repeat(161) })),
  ).toThrow(/name/);
});
it("maps canonical custom events and allows only safe calendar notification dates", () => {
  const event = customPracticeEvent({
    id: "test",
    title: "Practice",
    starts_at: "2026-10-20T20:00:00+00:00",
    ends_at: "2026-10-20T22:00:00+00:00",
    location: "PEAP",
    version: 1,
  });
  expect(event.start).toBe("2026-10-20T20:00:00.000Z");
  expect(event.source).toBe("custom");
  expect(notificationPath("/calendar?date=2026-10-20&event=custom:test")).toBe(
    "/calendar?date=2026-10-20&event=custom%3Atest",
  );
  for (const path of [
    "/calendar?date=2026-02-30",
    "/calendar?date=2026-10-20&next=//evil.test",
    "/calendar?date=2026-10-20&date=2026-10-21",
    "//evil.test/calendar?date=2026-10-20",
  ])
    expect(notificationPath(path)).toBe("/home");
});
