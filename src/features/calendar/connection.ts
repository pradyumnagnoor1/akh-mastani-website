import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/features/identity/session";
import { connectionConfig } from "./config";
import { calendarService } from "./service";
import {
  authorizationUrl,
  seal,
  unseal,
  stateHash,
  validateAttempt,
  exchangeCode,
  type OAuthAttempt,
} from "./oauth";
import { fetchCalendar } from "./google";
const COOKIE = "akh-calendar-oauth";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
function redirect(origin: string, result: string) {
  return new Response(null, {
    status: 303,
    headers: {
      ...HEADERS,
      Location: new URL(`/admin/calendar?result=${result}`, origin).href,
    },
  });
}
function checkOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin)
    throw new Error("Invalid request origin.");
}
export async function startConnection(request: Request) {
  const { member } = await requireAdmin();
  const config = connectionConfig();
  if (!config)
    return Response.json(
      { error: "Calendar server setup is incomplete." },
      { status: 503, headers: HEADERS },
    );
  try {
    checkOrigin(request, config.origin);
    const form = await request.formData(),
      calendarId = String(form.get("calendar_id") ?? "").trim();
    if (
      !calendarId ||
      calendarId.length > 1024 ||
      /[\s\x00-\x1f]/.test(calendarId) ||
      calendarId === "primary"
    )
      return redirect(config.origin, "invalid-calendar");
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    const { error } = await calendarService().rpc("begin_calendar_connection", {
      p_actor: member.id,
      p_state_hash: stateHash(state),
    });
    if (error) throw new Error("Connection attempt could not start.");
    const attempt: OAuthAttempt = {
      state,
      verifier,
      actor: member.id,
      calendarId,
      clientId: config.clientId,
      expires: Date.now() + 600_000,
    };
    (await cookies()).set(
      COOKIE,
      seal(JSON.stringify(attempt), config.key, "oauth-state"),
      {
        httpOnly: true,
        secure: config.origin.startsWith("https:"),
        sameSite: "lax",
        path: "/api/calendar/oauth",
        maxAge: 600,
      },
    );
    return new Response(null, {
      status: 303,
      headers: {
        ...HEADERS,
        Location: authorizationUrl({
          clientId: config.clientId,
          redirectUri: config.redirectUri,
          state,
          verifier,
        }),
      },
    });
  } catch {
    return redirect(config.origin, "failed");
  }
}
export async function finishConnection(request: Request) {
  const { member } = await requireAdmin();
  const config = connectionConfig();
  if (!config)
    return Response.json(
      { error: "Calendar server setup is incomplete." },
      { status: 503, headers: HEADERS },
    );
  const store = await cookies(),
    value = store.get(COOKIE)?.value;
  store.set(COOKIE, "", {
    httpOnly: true,
    secure: config.origin.startsWith("https:"),
    sameSite: "lax",
    path: "/api/calendar/oauth",
    maxAge: 0,
  });
  try {
    const url = new URL(request.url);
    if (!value) throw new Error("Missing connection attempt.");
    const attempt = validateAttempt(
      JSON.parse(unseal(value, config.key, "oauth-state")),
      member.id,
      url.searchParams.get("state") ?? "",
      config.clientId,
    );
    const service = calendarService();
    const consumed = await service.rpc("consume_calendar_connection", {
      p_actor: member.id,
      p_state_hash: stateHash(attempt.state),
    });
    if (consumed.error || typeof consumed.data !== "number")
      throw new Error("Connection attempt is no longer valid.");
    if (url.searchParams.has("error"))
      return redirect(config.origin, "cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new Error("Missing authorization code.");
    const refreshToken = await exchangeCode({
      ...config,
      code,
      verifier: attempt.verifier,
    });
    // Check this account actually sees the requested calendar, before replacing a working connection.
    await fetchCalendar({
      calendarId: attempt.calendarId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    const saved = await service.rpc("save_calendar_connection", {
      p_actor: member.id,
      p_expected_version: consumed.data,
      p_calendar_id: attempt.calendarId,
      p_client_id: config.clientId,
      p_encrypted_token: seal(
        refreshToken,
        config.key,
        `calendar-token:${config.clientId}:${attempt.calendarId}`,
      ),
    });
    if (saved.error)
      throw new Error("Connection changed or permission revoked.");
    return redirect(config.origin, "connected");
  } catch {
    return redirect(config.origin, "failed");
  }
}
export async function disconnectConnection(request: Request) {
  const { member } = await requireAdmin(),
    config = connectionConfig();
  if (!config)
    return Response.json(
      { error: "Calendar server setup is incomplete." },
      { status: 503, headers: HEADERS },
    );
  try {
    checkOrigin(request, config.origin);
    const form = await request.formData(),
      version = Number(form.get("version"));
    if (!Number.isSafeInteger(version) || version < 0)
      throw new Error("Invalid version.");
    const result = await calendarService().rpc(
      "disconnect_calendar_connection",
      { p_actor: member.id, p_expected_version: version },
    );
    if (result.error)
      throw new Error("Connection changed or permission revoked.");
    return redirect(config.origin, "disconnected");
  } catch {
    return redirect(config.origin, "failed");
  }
}
