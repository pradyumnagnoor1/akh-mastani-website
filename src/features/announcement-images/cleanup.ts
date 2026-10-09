import "server-only";
import { after } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
export async function cleanupAnnouncementImages() {
  const service = serviceClient();
  const jobs = await service.rpc("announcement_cleanup_jobs");
  if (jobs.error || !Array.isArray(jobs.data))
    throw new Error("Image cleanup unavailable.");
  const paths = jobs.data.filter(
    (path: unknown): path is string => typeof path === "string",
  );
  if (!paths.length) return;
  const removed = await service.storage
    .from("announcement-images")
    .remove(paths);
  if (removed.error) throw new Error("Image cleanup unavailable.");
  const finished = await service.rpc("finish_announcement_cleanup", {
    p_paths: paths,
  });
  if (finished.error) throw new Error("Image cleanup unavailable.");
}
export function scheduleImageCleanup() {
  after(async () => {
    try {
      await cleanupAnnouncementImages();
    } catch {
      console.warn("announcement_image_cleanup_unavailable");
    }
  });
}
