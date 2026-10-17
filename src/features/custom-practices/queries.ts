import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { collectPages } from "@/features/communication/pagination";
import { customPracticeEvent, type CustomPractice } from "./policy";
export const customPracticeData = cache(async () => {
  const context = await requireMember();
  const rows = await collectPages((from, to) =>
    context.supabase
      .from("custom_practices")
      .select("id,title,starts_at,ends_at,location,version")
      .order("id")
      .range(from, to),
  );
  const practices = rows as CustomPractice[];
  return { ...context, practices, events: practices.map(customPracticeEvent) };
});
