"use server";
import { requireAdmin } from "@/features/identity/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validVersion } from "@/features/communication/policy";
import { validateCustomPractice } from "./policy";
import { schedulePush } from "@/features/notifications/dispatch";
import type { FormState } from "@/features/communication/types";
export async function saveCustomPractice(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  const id = String(form.get("id") ?? "");
  try {
    const version = Number(form.get("version"));
    validVersion(id, version);
    const fields = validateCustomPractice(form);
    args = {
      target_id: id,
      expected_version: version,
      practice_title: fields.custom_title,
      starts: fields.custom_start,
      ends: fields.custom_end,
      practice_location: fields.custom_location,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const result = await supabase.rpc("save_custom_practice", args);
    if (result.error)
      return {
        error:
          "Practice could not be saved. Check its times and refresh if it changed.",
      };
  } catch {
    return {
      error:
        "We could not confirm the save. Your details are still here; refresh before retrying.",
    };
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect(`/calendar?date=${String(form.get("custom_date"))}`);
}
export async function deleteCustomPractice(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  try {
    const id = String(form.get("id") ?? ""),
      version = Number(form.get("version"));
    validVersion(id, version);
    const result = await supabase.rpc("delete_custom_practice", {
      target_id: id,
      expected_version: version,
    });
    if (result.error)
      return { error: "Unable to delete. Refresh if the practice changed." };
  } catch {
    return { error: "Unable to confirm deletion. Refresh before retrying." };
  }
  revalidatePath("/", "layout");
  redirect("/calendar");
}
