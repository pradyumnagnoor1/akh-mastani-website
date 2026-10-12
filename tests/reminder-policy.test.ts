import { it, expect } from "vitest";
import {
  chicagoReminderTime,
  reminderFields,
  validateAnnouncementReminder,
} from "../src/features/notifications/reminder-policy";
import { notificationDispatchEnabled } from "../src/features/notifications/environment";
import { vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllEnvs());
it("converts Texas summer/winter times and round-trips saved settings", () => {
  expect(chicagoReminderTime("2026-10-12", "18:00")).toBe(
    "2026-10-12T23:00:00.000Z",
  );
  expect(chicagoReminderTime("2026-12-12", "18:00")).toBe(
    "2026-12-13T00:00:00.000Z",
  );
  expect(reminderFields("2026-10-12T23:00:00Z")).toEqual({
    date: "2026-10-12",
    time: "18:00",
  });
});
it("rejects nonexistent/repeated DST times and invalid dates", () => {
  for (const date of ["2026-03-08", "2026-11-01"])
    expect(() =>
      chicagoReminderTime(date, date.includes("03") ? "02:30" : "01:30"),
    ).toThrow(/daylight saving/);
  expect(() => chicagoReminderTime("2026-02-30", "12:00")).toThrow();
});
it("requires a valid task for linked reminders but no author summary", () => {
  const form = new FormData();
  expect(validateAnnouncementReminder(form)).toMatchObject({
    reminder_time: null,
  });
  form.set("reminder_enabled", "true");
  form.set("reminder_mode", "linked-task");
  form.set("reminder_date", "2026-10-12");
  form.set("reminder_time", "18:00");
  expect(() => validateAnnouncementReminder(form)).toThrow(/linked task/);
  form.set("reminder_task_id", "00000000-0000-4000-8000-000000000010");
  expect(validateAnnouncementReminder(form)).toMatchObject({
    reminder_text: "",
    reminder_type: "linked-task",
  });
});
it("hard-disables Preview dispatch and supports a production/local kill switch", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NOTIFICATION_DISPATCH_ENABLED", "true");
  expect(notificationDispatchEnabled()).toBe(false);
  vi.stubEnv("VERCEL_ENV", "production");
  expect(notificationDispatchEnabled()).toBe(true);
  vi.stubEnv("NOTIFICATION_DISPATCH_ENABLED", "false");
  expect(notificationDispatchEnabled()).toBe(false);
});
