import { timingSafeEqual } from "node:crypto";
import { pushConfig } from "@/features/notifications/config";
import { dispatchPush } from "@/features/notifications/dispatch";
import { enqueueReminders } from "@/features/notifications/reminders";
export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!pushConfig())
    return Response.json(
      { error: "Notifications are not configured." },
      { status: 503, headers },
    );
  try {
    await enqueueReminders();
    return Response.json(await dispatchPush(), { headers });
  } catch {
    return Response.json(
      { error: "Notification processing unavailable." },
      { status: 503, headers },
    );
  }
}
