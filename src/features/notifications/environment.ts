/** Preview shares production data; only production/local test processes may dispatch. */
export function notificationDispatchEnabled() {
  return (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.NOTIFICATION_DISPATCH_ENABLED !== "false"
  );
}
