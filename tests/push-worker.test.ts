import { createECDH } from "node:crypto";
import { it, expect, vi } from "vitest";
import {
  pushEndpoint,
  pushSubscription,
  notificationPath,
} from "../src/features/notifications/policy";
import {
  deliverJobs,
  type PushJob,
} from "../src/features/notifications/worker";
const curve = createECDH("prime256v1");
curve.generateKeys();
const keys = {
  p256dh: curve.getPublicKey().toString("base64url"),
  auth: Buffer.alloc(16, 7).toString("base64url"),
};
function job(n = 0): PushJob {
  return {
    id: String(n),
    subscription_id: "device",
    lease_token: "lease",
    endpoint: `https://web.push.apple.com/Q${n}`,
    ...keys,
    payload: {
      title: "AKH Mastani",
      body: "A team announcement is available.",
      url: "/announcements",
    },
  };
}
it("accepts actual browser subscription keys while preventing arbitrary outbound requests", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/a",
    "https://web.push.apple.com/a",
    "https://updates.push.services.mozilla.com/a",
  ])
    expect(pushSubscription({ endpoint, keys }).endpoint).toBe(endpoint);
  for (const endpoint of [
    "http://web.push.apple.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://web.push.apple.com.evil.test/a",
    "https://evilweb.push.apple.com/a",
    "https://fcm.googleapis.com:444/a",
    "https://user:pass@web.push.apple.com/a",
    "https://fcm.googleapis.com/a#secret",
  ])
    expect(() => pushEndpoint(endpoint)).toThrow();
  expect(() =>
    pushSubscription({
      endpoint: "https://web.push.apple.com/a",
      keys: { ...keys, p256dh: Buffer.alloc(65).toString("base64url") },
    }),
  ).toThrow();
  expect(() =>
    pushSubscription({
      endpoint: "https://web.push.apple.com/a",
      keys: { ...keys, auth: "x" },
    }),
  ).toThrow();
});
it("limits click targets to team pages", () => {
  for (const url of [
    "//evil.test",
    "https://evil.test",
    "/api/calendar/oauth/start",
    "/\\evil.test",
    "/announcements?next=evil",
  ])
    expect(notificationPath(url)).toBe("/home");
  expect(
    notificationPath("/todos/00000000-0000-4000-8000-000000000001"),
  ).toContain("/todos/");
});
it("does not deliver to revoked or no-longer-eligible recipients", async () => {
  const send = vi.fn();
  const finish = vi.fn();
  expect(
    await deliverJobs([job()], { eligible: async () => false, send, finish }),
  ).toMatchObject({ failed: 1 });
  expect(send).not.toHaveBeenCalled();
  expect(finish).toHaveBeenCalledWith(job(), "failed");
});
it("expires invalid endpoints, retries provider failures and discards permanent errors", async () => {
  for (const [statusCode, expected] of [
    [410, "expired"],
    [404, "expired"],
    [429, "retry"],
    [503, "retry"],
    [401, "failed"],
    [400, "failed"],
  ] as const) {
    const finish = vi.fn();
    await deliverJobs([job()], {
      eligible: async () => true,
      send: async () => {
        throw { statusCode };
      },
      finish,
    });
    expect(finish).toHaveBeenCalledWith(job(), expected);
  }
});
it.each([35, 40, 45])(
  "caps work and concurrency for %i jobs and never leaks private content into delivery payload",
  async (count) => {
    let running = 0,
      peak = 0;
    const payloads: string[] = [];
    const result = await deliverJobs(
      Array.from({ length: count }, (_, i) => job(i)),
      {
        eligible: async () => true,
        send: async (_, payload) => {
          running++;
          peak = Math.max(peak, running);
          payloads.push(payload);
          await new Promise((r) => setTimeout(r, 1));
          running--;
        },
        finish: async () => {},
      },
    );
    expect(result.sent).toBe(Math.min(count, 40));
    expect(payloads).toHaveLength(Math.min(count, 40));
    expect(peak).toBeLessThanOrEqual(10);
    expect(JSON.parse(payloads[0])).toEqual({
      title: "AKH Mastani",
      body: "A team announcement is available.",
      url: "/announcements",
      tag: "mastani-0",
    });
  },
);
it("recovers ambiguous delivery and keeps stable tags for retried jobs", async () => {
  const payloads: string[] = [];
  const dependencies = {
    eligible: async () => true,
    send: async (_: unknown, payload: string) => {
      payloads.push(payload);
    },
    finish: async () => {
      throw new Error("storage offline");
    },
  };
  expect((await deliverJobs([job()], dependencies)).retry).toBe(1);
  await deliverJobs([job()], dependencies);
  expect(payloads[0]).toBe(payloads[1]);
});
