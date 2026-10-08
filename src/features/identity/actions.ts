"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { schedulePush } from "@/features/notifications/dispatch";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authConfig, supabaseConfig } from "@/lib/config";
import { identity, requireAdmin } from "./session";
import { normalizeName } from "./policy";
export type FormState = { error: string | null; success?: string };

export async function signIn() {
  const config = authConfig();
  if (!config) redirect("/login?error=configuration");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${config.origin}/auth/callback`,
      queryParams: { hd: "tamu.edu", prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=signin");
  redirect(data.url);
}
export async function signOut() {
  if (supabaseConfig()) {
    const supabase = await createClient();
    const store = await cookies();
    const device = store.get("mastani-push-device")?.value;
    if (device && /^[0-9a-f-]{36}$/i.test(device)) {
      const removed = await supabase.rpc("push_unregister_device", {
        p_id: device,
      });
      if (removed.error)
        throw new Error(
          "Unable to disable this device’s notifications. Try signing out again.",
        );
    }
    store.delete("mastani-push-device");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Unable to sign out. Please try again.");
  }
  redirect("/login");
}
export async function saveName(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const { supabase, member } = await identity();
  if (member?.status === "inactive") redirect("/membership");
  let name: string;
  try {
    name = normalizeName(String(data.get("name") ?? ""));
  } catch (error) {
    return { error: (error as Error).message };
  }
  const { error } = await supabase.rpc("complete_onboarding", {
    member_name: name,
  });
  if (error)
    return { error: "Your name could not be saved. Please try again." };
  schedulePush();
  revalidatePath("/", "layout");
  redirect(member?.status === "active" ? "/home" : "/membership");
}
export async function manageMember(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const target_id = String(data.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(target_id))
    return { error: "Select a valid member." };
  const operation = data.get("operation");
  let result;
  if (operation === "name") {
    let member_name: string;
    try {
      member_name = normalizeName(String(data.get("name") ?? ""));
    } catch (error) {
      return { error: (error as Error).message };
    }
    result = await supabase.rpc("correct_member_name", {
      target_id,
      member_name,
    });
  } else if (operation === "active" || operation === "inactive") {
    result = await supabase.rpc("set_member_status", {
      target_id,
      new_status: operation,
    });
  } else return { error: "Choose a supported action." };
  if (result.error)
    return {
      error:
        "The change could not be saved. Check that the member has completed setup and try again.",
    };
  schedulePush();
  revalidatePath("/", "layout");
  return { error: null, success: "Member updated." };
}
