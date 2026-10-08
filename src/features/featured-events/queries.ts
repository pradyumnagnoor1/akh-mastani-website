import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { collectPages } from "@/features/communication/pagination";
import type { FeaturedEvent } from "./types";
export const featuredData = cache(async () => {
  const context = await requireMember();
  const events = await collectPages((from, to) =>
    context.supabase
      .from("featured_events")
      .select("*")
      .order("event_date")
      .order("id")
      .range(from, to),
  );
  return { ...context, events: events as FeaturedEvent[] };
});
