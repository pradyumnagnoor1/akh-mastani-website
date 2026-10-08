import "server-only";
import { after } from "next/server";
import { serviceClient } from "@/lib/supabase/service";

/** Durable queue contains only object keys; failed Storage deletes remain retryable. */
export async function cleanupFormationFiles() {
  const service = serviceClient();
  const jobs = await service.rpc("formation_cleanup_jobs");
  if (jobs.error || !Array.isArray(jobs.data))
    throw new Error("File cleanup unavailable.");
  const paths = jobs.data.filter(
    (path: unknown): path is string => typeof path === "string",
  );
  if (!paths.length) return;
  const removed = await service.storage.from("formations").remove(paths);
  if (removed.error) throw new Error("File cleanup unavailable.");
  const finished = await service.rpc("finish_formation_cleanup", {
    p_paths: paths,
  });
  if (finished.error) throw new Error("File cleanup unavailable.");
}

export function scheduleFormationCleanup() {
  after(async () => {
    try {
      await cleanupFormationFiles();
    } catch {
      console.warn("formation_cleanup_unavailable");
    }
  });
}
