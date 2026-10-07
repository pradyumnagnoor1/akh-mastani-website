import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { requireMember } from "@/features/identity/session";
import { supabaseConfig } from "@/lib/config";
import { calendarConfig } from "./config";
import { CalendarFailure, fetchCalendar } from "./google";
import { viewFromSnapshot, type CalendarSnapshot } from "./types";

export class CalendarAccessError extends Error {}

export const calendarData = cache(async () => {
  const context = await requireMember(),
    config = await calendarConfig();
  if (!config) return { ...context, calendar: viewFromSnapshot(null, null) };
  async function read() {
    // Explicit active-member RPC also distinguishes revoked access from an empty cache.
    const active = await context.supabase.rpc("active_member");
    if (active.error) throw new Error("Unable to verify calendar access.");
    if (active.data !== true)
      throw new CalendarAccessError(
        "Active membership required to load the calendar.",
      );
    const result = await context.supabase
      .from("calendar_snapshot")
      .select(
        "source_fingerprint,events,last_success_at,last_error,lease_until,window_start,window_end",
      )
      .eq("id", true)
      .maybeSingle();
    if (result.error)
      throw new Error("Unable to load the calendar. Please try again.");
    return result.data as CalendarSnapshot | null;
  }
  let snapshot = await read();
  const initial = viewFromSnapshot(snapshot, config.source);
  if (initial.stale) {
    // This client is private to the adapter, never accepts a user session, and only calls calendar RPCs.
    const service = createClient(supabaseConfig()!.url, config.secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          }),
      },
    });
    const claim = await service.rpc("calendar_claim_refresh", {
      p_source: config.source,
      p_actor: context.member.id,
    });
    let storageFailure = !!claim.error;
    if (!claim.error && claim.data) {
      try {
        const result = await fetchCalendar(config);
        const saved = await service.rpc("calendar_finish_refresh", {
          p_source: config.source,
          p_token: claim.data,
          p_events: result.events,
          p_window_start: result.windowStart,
          p_window_end: result.windowEnd,
        });
        if (saved.error) throw new Error("Calendar cache write failed.");
      } catch (error) {
        const failed = await service.rpc("calendar_fail_refresh", {
          p_source: config.source,
          p_token: claim.data,
          p_error_code:
            error instanceof CalendarFailure ? error.code : "storage",
        });
        if (failed.error) storageFailure = true;
      }
    }
    snapshot = await read();
    if (storageFailure && snapshot?.source_fingerprint === config.source)
      snapshot = { ...snapshot, last_error: "storage" };
  }
  return { ...context, calendar: viewFromSnapshot(snapshot, config.source) };
});
