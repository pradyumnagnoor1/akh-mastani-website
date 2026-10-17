import {
  chicagoReminderTime,
  reminderFields,
} from "../notifications/reminder-policy";
import type { CalendarEvent } from "@/features/calendar/types";
export type CustomPractice = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  version: number;
};
export function customPracticeEvent(row: CustomPractice): CalendarEvent {
  return {
    id: `custom:${row.id}`,
    title: row.title,
    start: new Date(row.starts_at).toISOString(),
    end: new Date(row.ends_at).toISOString(),
    location: row.location,
    allDay: false,
    url: null,
    recurringEventId: null,
    originalStart: null,
    source: "custom",
    version: row.version,
  };
}
export function practiceFields(event?: CalendarEvent | null) {
  const start = reminderFields(event?.start),
    end = reminderFields(event?.end);
  return {
    title: event?.title ?? "",
    date: start.date,
    start: start.time,
    endDate: end.date,
    end: end.time,
    location: event?.location ?? "",
  };
}
export function validateCustomPractice(form: FormData) {
  const get = (key: string) => String(form.get(key) ?? "").trim();
  const title = get("custom_title"),
    location = get("custom_location");
  if (!title || [...title].length > 160 || /[\u0000-\u001f\u007f]/.test(title))
    throw new Error("Enter a practice name of 1–160 characters.");
  if (
    !location ||
    [...location].length > 200 ||
    /[\u0000-\u001f\u007f]/.test(location)
  )
    throw new Error("Enter a practice location of 1–200 characters.");
  const start = chicagoReminderTime(get("custom_date"), get("custom_start"));
  const end = chicagoReminderTime(
    get("custom_end_date") || get("custom_date"),
    get("custom_end"),
  );
  if (
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 86400000
  )
    throw new Error(
      "Practice must end after it starts and last no more than 24 hours. Use the next end date for an overnight practice.",
    );
  return {
    custom_title: title,
    custom_location: location,
    custom_start: start,
    custom_end: end,
  };
}
