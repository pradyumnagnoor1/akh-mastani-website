import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/config";
import { destination, isTamuEmail, type Member } from "./policy";

export const identity = cache(async () => {
  if (!supabaseConfig()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?error=session");
  if (
    !isTamuEmail(user.email) ||
    !user.email_confirmed_at ||
    user.app_metadata.provider !== "google"
  )
    redirect("/login?error=domain");
  const result = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (result.error)
    throw new Error("Unable to load membership. Please try again.");
  return { supabase, user, member: result.data as Member | null };
});

export async function requireMember() {
  const context = await identity();
  if (!context.member) redirect("/onboarding");
  const target = destination(context.member);
  if (target !== "/home") redirect(target);
  return { ...context, member: context.member };
}

export async function requireAdmin() {
  const context = await requireMember();
  if (!context.member.is_admin) redirect("/home");
  return context;
}
