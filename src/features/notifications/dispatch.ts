import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { pushConfig } from "./config";
import { pushService } from "./service";
import { deliverJobs, PUSH_BATCH_LIMIT, type PushJob } from "./worker";
import { notificationDispatchEnabled } from "./environment";
export async function dispatchPush() {
  if (!notificationDispatchEnabled())
    return {
      configured: false,
      disabled: true,
      sent: 0,
      retry: 0,
      expired: 0,
      failed: 0,
    };
  const config = pushConfig();
  if (!config)
    return { configured: false, sent: 0, retry: 0, expired: 0, failed: 0 };
  const service = pushService();
  const { data, error } = await service.rpc("push_claim_jobs", {
    p_limit: PUSH_BATCH_LIMIT,
  });
  if (error || !Array.isArray(data))
    throw new Error("Unable to claim notification jobs.");
  const counts = await deliverJobs(data as PushJob[], {
    prepare: async (job) => {
      const check = await service.rpc("push_prepare_delivery", {
        p_id: job.id,
        p_token: job.lease_token,
      });
      if (check.error) throw new Error("Notification eligibility unavailable.");
      return check.data;
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
          TTL: Math.max(
            1,
            Math.min(
              3600,
              Math.floor(
                (Date.parse(
                  JSON.parse(payload).expiresAt ??
                    new Date(Date.now() + 3600_000).toISOString(),
                ) -
                  Date.now()) /
                  1000,
              ),
            ),
          ),
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
  if (!notificationDispatchEnabled()) return;
  if (!pushConfig()) return;
  after(async () => {
    try {
      await dispatchPush();
    } catch {
      console.warn("push_delivery_unavailable");
    }
  });
}
