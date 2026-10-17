import type { CalendarEvent } from "./types";
export function chicagoDay(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export function validDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    day >= "2000-01-01" &&
    day <= "2100-12-31" &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function moveDay(day: string, step: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + step * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function practiceIdentity(event: CalendarEvent) {
  return event.recurringEventId && event.originalStart
    ? `${event.recurringEventId}@${event.originalStart}`
    : event.id;
}
export function eventOnDay(event: CalendarEvent, day: string) {
  if (event.allDay) return event.start <= day && event.end > day;
  return (
    chicagoDay(new Date(event.start)) <= day &&
    chicagoDay(new Date(Date.parse(event.end) - 1)) >= day
  );
}
export function eventStatus(event: CalendarEvent, now: Date) {
  if (event.allDay)
    return event.end <= chicagoDay(now)
      ? "Ended"
      : event.start > chicagoDay(now)
        ? "Upcoming"
        : "Happening now";
  return Date.parse(event.end) <= now.getTime()
    ? "Ended"
    : Date.parse(event.start) <= now.getTime()
      ? "Happening now"
      : "Upcoming";
}
