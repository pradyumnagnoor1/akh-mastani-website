import "server-only";
import { pushService } from "./service";
import { notificationDispatchEnabled } from "./environment";
export async function enqueueReminders() {
  if (!notificationDispatchEnabled()) return 0;
  const result = await pushService().rpc("push_enqueue_reminders");
  if (result.error) throw new Error("Reminder enqueue unavailable.");
  return result.data;
}
