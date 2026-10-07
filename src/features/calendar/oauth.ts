import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export type OAuthAttempt = {
  state: string;
  verifier: string;
  actor: string;
  calendarId: string;
  clientId: string;
  expires: number;
};
export function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new Error("Calendar encryption key must be 32 bytes in base64.");
  return key;
}
export function seal(value: string, key: string, purpose: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal(value: string, key: string, purpose: string): string {
  if (value.length > 16_000) throw new Error("Invalid encrypted value.");
  const data = Buffer.from(value, "base64url");
  if (data.length < 29) throw new Error("Invalid encrypted value.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(key),
    data.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}
export function validateAttempt(
  value: unknown,
  actor: string,
  state: string,
  clientId: string,
  now = Date.now(),
): OAuthAttempt {
  if (!value || typeof value !== "object")
    throw new Error("Invalid connection attempt.");
  const a = value as OAuthAttempt;
  if (
    a.actor !== actor ||
    a.state !== state ||
    a.clientId !== clientId ||
    typeof a.expires !== "number" ||
    a.expires <= now ||
    a.expires > now + 600_000 ||
    typeof a.state !== "string" ||
    a.state.length < 43 ||
    typeof a.verifier !== "string" ||
    a.verifier.length < 43 ||
    typeof a.calendarId !== "string" ||
    !a.calendarId ||
    a.calendarId.length > 1024
  )
    throw new Error("Invalid connection attempt.");
  return a;
}
export function authorizationUrl({
  clientId,
  redirectUri,
  state,
  verifier,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}
export async function exchangeCode(
  {
    clientId,
    clientSecret,
    redirectUri,
    code,
    verifier,
  }: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    verifier: string;
  },
  request: typeof fetch = fetch,
): Promise<string> {
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google authorization failed.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Invalid Google authorization response.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 64_000) {
        await reader.cancel();
        throw new Error("Invalid Google authorization response.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    typeof body.refresh_token !== "string" ||
    !body.refresh_token ||
    body.refresh_token.length > 4096 ||
    typeof body.scope !== "string" ||
    !body.scope.split(" ").includes(CALENDAR_SCOPE)
  )
    throw new Error("Google did not grant offline calendar access.");
  return body.refresh_token;
}
