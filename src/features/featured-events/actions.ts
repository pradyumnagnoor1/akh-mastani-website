"use server";
import { validateExpiration } from "@/features/expiration/policy";
import { requireAdmin } from "@/features/identity/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validVersion } from "@/features/communication/policy";
import { schedulePush } from "@/features/notifications/dispatch";
import type { FormState } from "@/features/payments/types";
import { validateFeatured } from "./policy";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function saveFeaturedEvent(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  try {
    const id = value(form, "id"),
      version = Number(form.get("version"));
    validVersion(id, version);
    const event = validateFeatured({
      title: value(form, "title"),
      description: value(form, "description"),
      date: value(form, "event_date"),
      time: value(form, "start_time"),
      location: value(form, "location"),
      link: value(form, "event_link"),
    });
    args = {
      target_id: id,
      expected_version: version,
      event_title: event.title,
      event_description: event.description,
      event_day: event.date,
      event_time: event.time,
      event_location: event.location,
      event_url: event.link,
      expiration_date: validateExpiration(value(form, "expiration_date")),
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("save_featured_event_expiring", args);
    if (error)
      return {
        error:
          "Unable to save. Refresh if the event changed, then check its details.",
      };
  } catch {
    return { error: "Unable to confirm the save. Refresh before retrying." };
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect("/calendar");
}
export async function deleteFeaturedEvent(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  try {
    const id = value(form, "id"),
      version = Number(form.get("version"));
    validVersion(id, version);
    const { error } = await supabase.rpc("delete_featured_event", {
      target_id: id,
      expected_version: version,
    });
    if (error)
      return { error: "Unable to delete. Refresh if the event changed." };
  } catch {
    return { error: "Unable to confirm deletion. Refresh before retrying." };
  }
  revalidatePath("/", "layout");
  redirect("/calendar");
}
