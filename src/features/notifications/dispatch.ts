import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { pushConfig } from "./config";
import { pushService } from "./service";
import { deliverJobs, type PushJob } from "./worker";
export async function dispatchPush() {
  const config = pushConfig();
  if (!config)
    return { configured: false, sent: 0, retry: 0, expired: 0, failed: 0 };
  const service = pushService();
  const { data, error } = await service.rpc("push_claim_jobs", { p_limit: 20 });
  if (error || !Array.isArray(data))
    throw new Error("Unable to claim notification jobs.");
  const counts = await deliverJobs(data as PushJob[], {
    eligible: async (job) => {
      const check = await service.rpc("push_can_deliver", {
        p_id: job.id,
        p_token: job.lease_token,
      });
      if (check.error) throw new Error("Notification eligibility unavailable.");
      return check.data === true;
    },
    send: async (subscription, payload) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          timeout: 5000,
          TTL: 3600,
          urgency: "normal",
        },
      ),
    finish: async (job, result) => {
      const completed = await service.rpc("push_finish_job", {
        p_id: job.id,
        p_token: job.lease_token,
        p_result: result,
      });
      if (completed.error) throw new Error("Notification result unavailable.");
    },
  });
  // Only aggregate counts; endpoints, keys and message bodies never enter application logs.
  if (data.length) console.info("push_delivery", counts);
  return { configured: true, ...counts };
}
export function schedulePush() {
  if (!pushConfig()) return;
  after(async () => {
    try {
      await dispatchPush();
    } catch {
      console.warn("push_delivery_unavailable");
    }
  });
}
