import { timingSafeEqual } from "node:crypto";
import { cleanupFormationFiles } from "@/features/segments/cleanup";

export const runtime = "nodejs";
export const maxDuration = 30;
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
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    await cleanupFormationFiles();
    return Response.json({ processed: true }, { headers });
  } catch {
    return Response.json(
      { error: "File cleanup unavailable." },
      { status: 503, headers },
    );
  }
}
