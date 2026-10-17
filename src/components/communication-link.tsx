import Link from "./app-link";
import type { CommunicationPost } from "@/features/communication/types";

export function CommunicationLink({
  post,
  posts,
  compact = false,
}: {
  post: CommunicationPost;
  posts: CommunicationPost[];
  compact?: boolean;
}) {
  // Only use records already returned by the viewer's authorized post query.
  const related =
    post.kind === "announcement"
      ? posts.find((p) => p.kind === "task" && p.id === post.linked_todo_id)
      : posts.find(
          (p) => p.kind === "announcement" && p.linked_todo_id === post.id,
        );
  if (!related) return null;
  return (
    <div
      className={
        compact ? "linked-communication" : "notice linked-communication"
      }
    >
      <Link
        className="text-button"
        href={`/${related.kind === "task" ? "todos" : "announcements"}/${related.id}`}
      >
        {related.kind === "task" ? "View linked to-do" : "View announcement"}:{" "}
        {related.title} →
      </Link>
      {!compact && (
        <p className="small">
          Reading the announcement and completing the to-do are tracked
          separately.
        </p>
      )}
    </div>
  );
}
