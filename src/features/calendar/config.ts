import "server-only";
import { createHash } from "node:crypto";
import { appOrigin } from "@/lib/config";
import type { CalendarConfig } from "./google";
import { calendarService } from "./service";
import { encryptionKey, unseal } from "./oauth";
export function connectionConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(),
    clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),
    key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim(),
    secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!clientId || !clientSecret || !key || !secretKey) return null;
  encryptionKey(key);
  const origin = appOrigin();
  return {
    clientId,
    clientSecret,
    key,
    secretKey,
    origin,
    redirectUri: `${origin}/api/calendar/oauth/callback`,
  };
}
export async function calendarConfig(): Promise<
  (CalendarConfig & { source: string; secretKey: string }) | null
> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(),
    clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),
    secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!clientId || !clientSecret || !secretKey) return null;
  const { data, error } = await calendarService().rpc(
    "calendar_read_connection",
  );
  if (error) throw new Error("Unable to load calendar connection.");
  if (data) {
    // An explicitly disconnected connection overrides any retained legacy environment token.
    if (
      !data.calendar_id ||
      !data.encrypted_token ||
      data.client_id !== clientId
    )
      return null;
    const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
    if (!key) throw new Error("Calendar encryption setup is incomplete.");
    const refreshToken = unseal(
      data.encrypted_token,
      key,
      `calendar-token:${clientId}:${data.calendar_id}`,
    );
    return {
      calendarId: data.calendar_id,
      clientId,
      clientSecret,
      refreshToken,
      secretKey,
      source: createHash("sha256")
        .update(`connected:${data.version}:${clientId}:${data.calendar_id}`)
        .digest("hex"),
    };
  }
  return null;
}
