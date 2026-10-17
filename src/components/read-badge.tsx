export function ReadBadge({ read }: { read: boolean }) {
  return (
    <span className={`badge ${read ? "success" : "unread"}`}>
      {read ? "Read" : "Unread"}
    </span>
  );
}
