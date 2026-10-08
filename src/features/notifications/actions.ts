"use server";
import { cookies } from "next/headers";
import { requireMember } from "@/features/identity/session";
import { pushConfig } from "./config";
import { pushEndpoint, pushSubscription } from "./policy";
const DEVICE_COOKIE = "mastani-push-device";
export async function getPushSettings() {
  const { supabase } = await requireMember();
  const config = pushConfig();
  const id = (await cookies()).get(DEVICE_COOKIE)?.value;
  let deviceRegistered = false;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const status = await supabase.rpc("push_device_registered", { p_id: id });
    if (status.error) throw new Error("Unable to load notification settings.");
    deviceRegistered = status.data === true;
  }
  return {
    configured: Boolean(config),
    publicKey: config?.publicKey ?? null,
    deviceRegistered,
  };
}
export async function subscribePush(
  input: unknown,
): Promise<{ error?: string }> {
  const { supabase } = await requireMember();
  const config = pushConfig();
  if (!config) return { error: "Notifications aren’t configured yet." };
  try {
    const data = pushSubscription(input);
    const { data: id, error } = await supabase.rpc(
      "push_register_subscription",
      {
        p_endpoint: data.endpoint,
        p_p256dh: data.p256dh,
        p_auth: data.auth,
      },
    );
    if (error || typeof id !== "string")
      return {
        error:
          "Unable to enable notifications. You can use up to five devices; disable another device if needed.",
      };
    (await cookies()).set(DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 31536000,
    });
    return {};
  } catch {
    return { error: "Unable to enable notifications. Refresh and try again." };
  }
}
export async function unsubscribePush(
  endpoint: string,
): Promise<{ error?: string }> {
  const { supabase } = await requireMember();
  try {
    const { error } = await supabase.rpc("push_unregister_subscription", {
      p_endpoint: pushEndpoint(endpoint),
    });
    if (error) return { error: "Unable to disable notifications. Try again." };
    (await cookies()).delete(DEVICE_COOKIE);
    return {};
  } catch {
    return { error: "Unable to disable notifications. Try again." };
  }
}
