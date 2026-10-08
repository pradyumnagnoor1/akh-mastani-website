import "server-only";
import { calendarConfig } from "@/features/calendar/config";
import { calendarService } from "@/features/calendar/service";
import { fetchCalendar, CalendarFailure } from "@/features/calendar/google";
import { pushService } from "./service";
export async function enqueueReminders() {
  const service = pushService();
  // Refresh from Google even when nobody has opened the website. Cached practice
  // reminders are only eligible while a connected snapshot is fresh.
  try {
    const config = await calendarConfig();
    if (config) {
      const actor = await service.rpc("push_calendar_actor");
      if (actor.error) throw new Error("Calendar actor unavailable.");
      if (actor.data) {
        const calendar = calendarService();
        const claim = await calendar.rpc("calendar_claim_refresh", {
          p_source: config.source,
          p_actor: actor.data,
        });
        if (claim.error) throw new Error("Calendar refresh unavailable.");
        if (claim.data) {
          try {
            const snapshot = await fetchCalendar(config);
            const saved = await calendar.rpc("calendar_finish_refresh", {
              p_source: config.source,
              p_token: claim.data,
              p_events: snapshot.events,
              p_window_start: snapshot.windowStart,
              p_window_end: snapshot.windowEnd,
            });
            if (saved.error) throw new Error("Calendar snapshot unavailable.");
          } catch (error) {
            await calendar.rpc("calendar_fail_refresh", {
              p_source: config.source,
              p_token: claim.data,
              p_error_code:
                error instanceof CalendarFailure ? error.code : "storage",
            });
          }
        }
      }
    }
  } catch {
    console.warn("push_calendar_refresh_unavailable");
  }
  const result = await service.rpc("push_enqueue_reminders");
  if (result.error) throw new Error("Reminder enqueue unavailable.");
  return result.data;
}
