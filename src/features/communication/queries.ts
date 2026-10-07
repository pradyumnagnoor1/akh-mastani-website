import "server-only";
import { cache } from "react";
import { requireMember, requireAdmin } from "@/features/identity/session";
import type { Member } from "@/features/identity/policy";
import type { Segment, Assignment } from "@/features/segments/policy";
import type {
  CommunicationPost,
  Recipient,
  CommunicationGroup,
  GroupMember,
} from "./types";
import { collectPages } from "./pagination";
export const communicationData = cache(async () => {
  const context = await requireMember();
  const [posts, recipients] = await Promise.all([
    collectPages((from, to) =>
      context.supabase
        .from("communication_posts")
        .select("*")
        .order("id")
        .range(from, to),
    ),
    collectPages((from, to) =>
      context.supabase
        .from("communication_recipients")
        .select("post_id,member_id,completed_at")
        .order("post_id")
        .order("member_id")
        .range(from, to),
    ),
  ]);
  return {
    ...context,
    posts: (posts as CommunicationPost[]).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
    recipients: recipients as Recipient[],
  };
});
export const communicationEditorData = cache(async () => {
  const { supabase } = await requireAdmin();
  const [people, groups, groupMembers, segments, assignments] =
    await Promise.all([
      collectPages((from, to) =>
        supabase
          .from("members")
          .select("id,email,display_name,status,is_admin")
          .eq("status", "active")
          .order("id")
          .range(from, to),
      ),
      collectPages((from, to) =>
        supabase
          .from("communication_groups")
          .select("*")
          .order("id")
          .range(from, to),
      ),
      collectPages((from, to) =>
        supabase
          .from("communication_group_members")
          .select("group_id,member_id")
          .order("group_id")
          .order("member_id")
          .range(from, to),
      ),
      collectPages((from, to) =>
        supabase.from("segments").select("*").order("id").range(from, to),
      ),
      collectPages((from, to) =>
        supabase
          .from("segment_members")
          .select("segment_id,member_id")
          .order("segment_id")
          .order("member_id")
          .range(from, to),
      ),
    ]);
  return {
    people: (people as Member[]).sort((a, b) =>
      (a.display_name ?? "").localeCompare(b.display_name ?? ""),
    ),
    groups: (groups as CommunicationGroup[]).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    groupMembers: groupMembers as GroupMember[],
    segments: (segments as Segment[]).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    assignments: assignments as Assignment[],
  };
});
