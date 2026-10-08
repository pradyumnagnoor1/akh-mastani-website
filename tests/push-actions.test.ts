import { createECDH } from "node:crypto";
import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  member: vi.fn(),
  rpc: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@/features/identity/session", () => ({ requireMember: m.member }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: m.set, delete: m.remove, get: m.get }),
}));
vi.mock("../src/features/notifications/config", () => ({
  pushConfig: m.config,
}));
import {
  getPushSettings,
  subscribePush,
  unsubscribePush,
} from "../src/features/notifications/actions";
const curve = createECDH("prime256v1");
curve.generateKeys();
const subscription = {
  endpoint: "https://web.push.apple.com/a",
  keys: {
    p256dh: curve.getPublicKey().toString("base64url"),
    auth: Buffer.alloc(16).toString("base64url"),
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockReturnValue(undefined);
  m.member.mockResolvedValue({ supabase: { rpc: m.rpc } });
  m.config.mockReturnValue({
    origin: "https://team.test",
    publicKey: "public",
  });
  m.rpc.mockResolvedValue({
    data: "00000000-0000-4000-8000-000000000001",
    error: null,
  });
});
it("authenticates all settings and writes and exposes only the public application key", async () => {
  expect(await getPushSettings()).toEqual({
    configured: true,
    publicKey: "public",
    deviceRegistered: false,
  });
  m.member.mockRejectedValue(new Error("denied"));
  await expect(getPushSettings()).rejects.toThrow("denied");
  await expect(subscribePush(subscription)).rejects.toThrow("denied");
  await expect(unsubscribePush(subscription.endpoint)).rejects.toThrow(
    "denied",
  );
  expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects unsupported endpoints before RPC and does not pretend unconfigured delivery is enabled", async () => {
  expect(
    (
      await subscribePush({
        ...subscription,
        endpoint: "https://127.0.0.1/secret",
      })
    ).error,
  ).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
  m.config.mockReturnValue(null);
  expect(await getPushSettings()).toEqual({
    configured: false,
    publicKey: null,
    deviceRegistered: false,
  });
  expect((await subscribePush(subscription)).error).toBeTruthy();
});
it("registers caller-owned device using secure HttpOnly identity and reports storage failure", async () => {
  expect(await subscribePush(subscription)).toEqual({});
  expect(m.rpc).toHaveBeenCalledWith("push_register_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
  });
  expect(m.set.mock.calls[0][2]).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
  m.rpc.mockResolvedValue({ error: { message: "private database detail" } });
  expect((await subscribePush(subscription)).error).not.toContain(
    "private database detail",
  );
});
it("removes delivery registration before deleting the device cookie", async () => {
  expect(await unsubscribePush(subscription.endpoint)).toEqual({});
  expect(m.rpc).toHaveBeenCalledWith("push_unregister_subscription", {
    p_endpoint: subscription.endpoint,
  });
  expect(m.remove).toHaveBeenCalledWith("mastani-push-device");
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  expect((await unsubscribePush(subscription.endpoint)).error).toBeTruthy();
  expect(m.remove).not.toHaveBeenCalled();
});

it("reads current owned device state and never re-enables a removed registration", async () => {
  m.get.mockReturnValue({ value: "00000000-0000-4000-8000-000000000001" });
  m.rpc.mockResolvedValue({ data: true, error: null });
  expect((await getPushSettings()).deviceRegistered).toBe(true);
  m.rpc.mockResolvedValue({ data: false, error: null });
  expect((await getPushSettings()).deviceRegistered).toBe(false);
  m.get.mockReturnValue(undefined);
  vi.clearAllMocks();
  expect((await getPushSettings()).deviceRegistered).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
});
