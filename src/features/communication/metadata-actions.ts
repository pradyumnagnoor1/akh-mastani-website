"use server";
import { revalidatePath } from "next/cache";
import { requireAnnouncementEditor } from "@/features/identity/session";
import { validVersion } from "./policy";
import type { FormState } from "./types";
export async function saveCommunicationMetadata(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAnnouncementEditor();
  try {
    const id = String(form.get("id")),
      version = Number(form.get("version"));
    validVersion(id, version);
    const priority = String(form.get("priority") ?? "normal");
    if (!["low", "normal", "high", "urgent"].includes(priority))
      return { error: "Choose a valid priority." };
    const { error } = await supabase.rpc("set_communication_metadata", {
      target_id: id,
      expected_version: version,
      pin: form.has("pinned"),
      task_priority: priority,
    });
    if (error)
      return {
        error: "This item could not be updated. Refresh and try again.",
      };
    revalidatePath("/", "layout");
    return { error: null, success: "Saved." };
  } catch {
    return { error: "Unable to save. Refresh before retrying." };
  }
}
