import type { CommunicationPost } from "@/features/communication/types";
export function AnnouncementAttribution({ post }: { post: CommunicationPost }) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  return (
    <span className="announcement-attribution">
      <span>
        <strong>{post.author_name ?? "Former team member"}</strong>
        {post.author_exec_role && (
          <>
            {" "}
            · <span className="badge">{post.author_exec_role}</span>
          </>
        )}
      </span>
      <span className="muted small">
        Posted <time dateTime={post.created_at}>{format(post.created_at)}</time>
        {post.edited_at && (
          <>
            {" "}
            · Edited{" "}
            <time dateTime={post.edited_at}>{format(post.edited_at)}</time>
          </>
        )}
      </span>
    </span>
  );
}
