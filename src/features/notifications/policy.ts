import { ECDH } from "node:crypto";

export function pushEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value))
    throw new Error("Invalid notification subscription.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const allowed =
    host === "fcm.googleapis.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".web.push.apple.com") ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".updates.push.services.mozilla.com");
  if (
    !allowed ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Unsupported notification service.");
  return url.href;
}
function key(value: unknown, bytes: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid notification subscription.");
  const result = Buffer.from(value, "base64url");
  if (result.length !== bytes || result.toString("base64url") !== value)
    throw new Error("Invalid notification subscription.");
  return result;
}
export function pushSubscription(input: unknown) {
  if (!input || typeof input !== "object")
    throw new Error("Invalid notification subscription.");
  const data = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = pushEndpoint(data.endpoint);
  const publicKey = key(data.keys?.p256dh, 65);
  // Reject invalid curve points before this subscription can reach the push service.
  ECDH.convertKey(publicKey, "prime256v1");
  const auth = key(data.keys?.auth, 16).toString("base64url");
  return { endpoint, p256dh: publicKey.toString("base64url"), auth };
}
export function notificationPath(value: unknown) {
  return typeof value === "string" &&
    /^\/(?:home|calendar|roster|segments|payments|todos|announcements)(?:\/[0-9a-f-]{36})?$/.test(
      value,
    )
    ? value
    : "/home";
}
