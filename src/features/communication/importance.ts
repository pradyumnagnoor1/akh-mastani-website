import type { CommunicationPost } from "./types";
const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
export function compareImportance(
  a: CommunicationPost,
  b: CommunicationPost,
  pinned: (post: CommunicationPost) => boolean,
) {
  return (
    Number(pinned(b)) - Number(pinned(a)) ||
    (pinned(a) && pinned(b)
      ? b.pinned_at!.localeCompare(a.pinned_at!)
      : a.kind === "task"
        ? ranks[a.priority ?? "normal"] - ranks[b.priority ?? "normal"] ||
          (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")
        : 0) ||
    b.created_at.localeCompare(a.created_at) ||
    a.id.localeCompare(b.id)
  );
}
