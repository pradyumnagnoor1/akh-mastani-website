import { it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  config: vi.fn(),
  rpc: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  exchange: vi.fn(),
  fetchCalendar: vi.fn(),
}));
vi.mock("@/features/identity/session", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("../src/features/calendar/config", () => ({
  connectionConfig: mocks.config,
}));
vi.mock("../src/features/calendar/service", () => ({
  calendarService: () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock("../src/features/calendar/google", () => ({
  fetchCalendar: mocks.fetchCalendar,
}));
vi.mock("../src/features/calendar/oauth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exchangeCode: mocks.exchange,
}));
import {
  startConnection,
  finishConnection,
  disconnectConnection,
} from "../src/features/calendar/connection";
import { seal } from "../src/features/calendar/oauth";
const key = randomBytes(32).toString("base64"),
  origin = "https://team.example";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ member: { id: "admin" } });
  mocks.config.mockReturnValue({
    clientId: "client",
    clientSecret: "secret",
    key,
    origin,
    redirectUri: `${origin}/api/calendar/oauth/callback`,
  });
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  mocks.exchange.mockResolvedValue("private-refresh");
  mocks.fetchCalendar.mockResolvedValue({ events: [] });
  mocks.get.mockReturnValue(undefined);
});
function post(path: string, form: Record<string, string>, foreign = false) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      Origin: foreign ? "https://evil.example" : origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
}
function callback({
  actor = "admin",
  state = "a".repeat(43),
  expires = Date.now() + 10000,
  queryState = state,
  extra = "code=code",
}: {
  actor?: string;
  state?: string;
  expires?: number;
  queryState?: string;
  extra?: string;
} = {}) {
  mocks.get.mockReturnValue({
    value: seal(
      JSON.stringify({
        actor,
        state,
        expires,
        verifier: "v".repeat(43),
        calendarId: "team",
        clientId: "client",
      }),
      key,
      "oauth-state",
    ),
  });
  return new Request(
    `${origin}/api/calendar/oauth/callback?state=${queryState}&${extra}`,
  );
}
it("rejects nonadmins and cross-origin connection changes before privileged calls", async () => {
  await startConnection(
    post("/api/calendar/oauth/start", { calendar_id: "team" }, true),
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  await disconnectConnection(
    post("/api/calendar/oauth/disconnect", { version: "0" }, true),
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.requireAdmin.mockRejectedValue(new Error("Denied"));
  await expect(
    startConnection(post("/api/calendar/oauth/start", { calendar_id: "team" })),
  ).rejects.toThrow("Denied");
  await expect(finishConnection(new Request(origin))).rejects.toThrow("Denied");
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("sets encrypted HttpOnly state and redirects to readonly PKCE consent", async () => {
  const response = await startConnection(
    post("/api/calendar/oauth/start", { calendar_id: "team" }),
  );
  expect(response.status).toBe(303);
  expect(
    new URL(response.headers.get("location")!).searchParams.get(
      "code_challenge_method",
    ),
  ).toBe("S256");
  expect(mocks.set.mock.calls[0][2]).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects forged, expired, missing or wrong-admin state without exchanging a code", async () => {
  for (const options of [
    { actor: "other" },
    { expires: Date.now() - 1 },
    { queryState: "forged" },
  ]) {
    const response = await finishConnection(callback(options));
    expect(response.headers.get("location")).toContain("result=failed");
  }
  mocks.get.mockReturnValue(undefined);
  await finishConnection(new Request(origin));
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("consumes once, verifies access before saving encrypted token, and handles cancellation", async () => {
  const response = await finishConnection(callback());
  expect(response.headers.get("location")).toContain("result=connected");
  expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
    "consume_calendar_connection",
    "save_calendar_connection",
  ]);
  const saved = mocks.rpc.mock.calls[1][1];
  expect(saved.p_encrypted_token).not.toContain("private-refresh");
  expect(saved.p_expected_version).toBe(0);
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  await finishConnection(callback({ extra: "error=access_denied" }));
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("preserves current connection on provider failure, stale save or replay", async () => {
  mocks.fetchCalendar.mockRejectedValueOnce(new Error("Private detail"));
  expect(
    (await finishConnection(callback())).headers.get("location"),
  ).toContain("result=failed");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "replayed" } });
  await finishConnection(callback());
  expect(mocks.exchange).not.toHaveBeenCalled();
});
