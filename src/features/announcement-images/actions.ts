"use server";
import { serviceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/features/identity/session";
import { validVersion } from "@/features/communication/policy";
import { normalizeJpeg } from "./validate";
import { scheduleImageCleanup } from "./cleanup";
export async function uploadAnnouncementImage(
  form: FormData,
): Promise<{ path?: string; error?: string }> {
  const { supabase, member } = await requireAdmin();
  let path: string | undefined;
  try {
    const id = String(form.get("id") ?? ""),
      version = Number(form.get("version"));
    validVersion(id, version);
    const file = form.get("image");
    if (!(file instanceof File)) throw new Error("Choose an image first.");
    const jpeg = await normalizeJpeg(file);
    const reservation = await supabase.rpc("reserve_announcement_image", {
      target_id: id,
      expected_version: version,
    });
    if (reservation.error || typeof reservation.data !== "string")
      throw new Error(
        "Unable to prepare this upload. Refresh if the announcement changed or remove unfinished images.",
      );
    path = reservation.data;
    const uploaded = await serviceClient()
      .storage.from("announcement-images")
      .upload(path!, jpeg, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "0",
      });
    if (uploaded.error)
      throw new Error(
        "Image upload failed. Check your connection or available storage and try again.",
      );
    const verified = await serviceClient().rpc("verify_announcement_image", {
      object_path: path,
      actor_id: member.id,
    });
    if (verified.error)
      throw new Error("Unable to finish the image upload. Try again.");
    return { path };
  } catch (error) {
    if (path) {
      try {
        await supabase.rpc("abandon_announcement_image", { object_path: path });
      } catch {}
      scheduleImageCleanup();
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to upload this image.",
    };
  }
}
export async function abandonAnnouncementImage(path: string) {
  const { supabase } = await requireAdmin();
  await supabase.rpc("abandon_announcement_image", { object_path: path });
  scheduleImageCleanup();
}
