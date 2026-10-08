import { it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  config: vi.fn(),
  dispatch: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@/features/notifications/config", () => ({ pushConfig: m.config }));
vi.mock("@/features/notifications/dispatch", () => ({
  dispatchPush: m.dispatch,
}));
vi.mock("@/features/notifications/reminders", () => ({
  enqueueReminders: m.enqueue,
}));
import { GET } from "../src/app/api/notifications/dispatch/route";
const secret = "x".repeat(43);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  m.config.mockReturnValue({});
  m.enqueue.mockResolvedValue(0);
  m.dispatch.mockResolvedValue({
    configured: true,
    sent: 1,
    retry: 0,
    expired: 0,
    failed: 0,
  });
});
afterEach(() => vi.unstubAllEnvs());
const request = (token?: string) =>
  new Request("https://team.test/api/notifications/dispatch", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
it("rejects missing, incorrect or short secrets before privileged processing", async () => {
  for (const token of [undefined, "bad", "y".repeat(43)])
    expect((await GET(request(token))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "short");
  expect((await GET(request("short"))).status).toBe(401);
  expect(m.enqueue).not.toHaveBeenCalled();
  expect(m.dispatch).not.toHaveBeenCalled();
});
it("returns honest setup/error responses without exposing underlying details", async () => {
  m.config.mockReturnValue(null);
  expect((await GET(request(secret))).status).toBe(503);
  expect(m.dispatch).not.toHaveBeenCalled();
  m.config.mockReturnValue({});
  m.enqueue.mockRejectedValue(new Error("private token"));
  const response = await GET(request(secret));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private token");
});
it("enqueues reminders then dispatches and prevents caching the response", async () => {
  const response = await GET(request(secret));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.enqueue.mock.invocationCallOrder[0]).toBeLessThan(
    m.dispatch.mock.invocationCallOrder[0],
  );
  expect(await response.json()).toEqual({
    configured: true,
    sent: 1,
    retry: 0,
    expired: 0,
    failed: 0,
  });
});
