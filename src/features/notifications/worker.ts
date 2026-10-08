import { pushSubscription, notificationPath } from "./policy";
export type PushJob = {
  id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lease_token: string;
  payload: { title: string; body: string; url: string };
};
export type DeliveryResult = "sent" | "retry" | "expired" | "failed";
export type WorkerDependencies = {
  eligible: (job: PushJob) => Promise<boolean>;
  send: (
    subscription: ReturnType<typeof pushSubscription>,
    payload: string,
  ) => Promise<unknown>;
  finish: (job: PushJob, result: DeliveryResult) => Promise<void>;
};
export async function deliverJobs(jobs: PushJob[], deps: WorkerDependencies) {
  const counts = { sent: 0, retry: 0, expired: 0, failed: 0 };
  // Bounded batches and concurrency keep one failing push provider from exhausting a function.
  const bounded = jobs.slice(0, 20);
  for (let offset = 0; offset < bounded.length; offset += 10) {
    await Promise.all(
      bounded.slice(offset, offset + 10).map(async (job) => {
        let result: DeliveryResult = "failed";
        try {
          const subscription = pushSubscription({
            endpoint: job.endpoint,
            keys: { p256dh: job.p256dh, auth: job.auth },
          });
          if (await deps.eligible(job)) {
            const payload = JSON.stringify({
              title: job.payload.title,
              body: job.payload.body,
              url: notificationPath(job.payload.url),
              tag: `mastani-${job.id}`,
            });
            try {
              await deps.send(subscription, payload);
              result = "sent";
            } catch (error) {
              const code = (error as { statusCode?: number })?.statusCode;
              result =
                code === 404 || code === 410
                  ? "expired"
                  : code && code >= 400 && code < 500 && code !== 429
                    ? "failed"
                    : "retry";
            }
          }
        } catch {
          result = "retry";
        }
        // If persistence fails, the lease expires and the scheduler can safely retry.
        // A stable notification tag reduces duplicate visible alerts after ambiguous delivery.
        try {
          await deps.finish(job, result);
          counts[result]++;
        } catch {
          counts.retry++;
        }
      }),
    );
  }
  return counts;
}
