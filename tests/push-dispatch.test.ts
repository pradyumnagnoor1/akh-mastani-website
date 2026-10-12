import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createECDH } from "node:crypto";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  after: vi.fn(),
  config: vi.fn(),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("web-push", () => ({ default: { sendNotification: m.send } }));
vi.mock("../src/features/notifications/config", () => ({
  pushConfig: m.config,
}));
vi.mock("../src/features/notifications/service", () => ({
  pushService: () => ({ rpc: m.rpc }),
}));
import {
  dispatchPush,
  schedulePush,
} from "../src/features/notifications/dispatch";
beforeEach(() => {
  vi.clearAllMocks();
  m.config.mockReturnValue({
    subject: "mailto:test@example.com",
    publicKey: "test-public",
    privateKey: "test-private",
  });
  m.send.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
it("blocks direct dispatch and after-mutation scheduling in Preview before private RPC access", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(await dispatchPush()).toMatchObject({ disabled: true, sent: 0 });
  schedulePush();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.after).not.toHaveBeenCalled();
  expect(m.config).not.toHaveBeenCalled();
});
it("sends the rebuilt payload with provider TTL bounded by its remaining validity", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  m.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "push_claim_jobs"
        ? [
            {
              id: "job",
              lease_token: "lease",
              endpoint: "https://web.push.apple.com/test",
              p256dh: curve.getPublicKey().toString("base64url"),
              auth: Buffer.alloc(16, 1).toString("base64url"),
              payload: { title: "Old", body: "2 to-dos", url: "/home" },
            },
          ]
        : name === "push_prepare_delivery"
          ? { title: "AKH Mastani", body: "1 to-do", url: "/home", expiresAt }
          : true,
    error: null,
  }));
  expect(await dispatchPush()).toMatchObject({ sent: 1 });
  expect(JSON.parse(m.send.mock.calls[0][1]).body).toBe("1 to-do");
  expect(m.send.mock.calls[0][2].TTL).toBeLessThanOrEqual(120);
  expect(m.send.mock.calls[0][2].TTL).toBeGreaterThan(0);
});
