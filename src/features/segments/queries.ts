import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { collectPages } from "@/features/communication/pagination";
import type { Segment, Assignment } from "./policy";
export const segmentData = cache(async () => {
  const context = await requireMember();
  const [segments, assignments] = await Promise.all([
    collectPages((from, to) =>
      context.supabase
        .from("segments")
        .select(
          "id,name,document_path,document_label,version,archived_at,updated_at",
        )
        .order("id")
        .range(from, to),
    ),
    collectPages((from, to) =>
      context.supabase
        .from("segment_members")
        .select("segment_id,member_id")
        .order("segment_id")
        .order("member_id")
        .range(from, to),
    ),
  ]);
  return {
    ...context,
    segments: (segments as Segment[]).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    assignments: assignments as Assignment[],
  };
});
