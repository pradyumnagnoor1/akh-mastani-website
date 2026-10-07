import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authConfig } from "@/lib/config";
import {
  destination,
  isTamuEmail,
  type Member,
} from "@/features/identity/policy";
export async function GET(request: NextRequest) {
  const config = authConfig();
  if (!config)
    return new NextResponse("Team sign-in is not configured yet.", {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  const origin = config.origin;
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish("/login?error=signin");
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return finish("/login?error=signin");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (
      !user ||
      !isTamuEmail(user.email) ||
      !user.email_confirmed_at ||
      user.app_metadata.provider !== "google"
    ) {
      await supabase.auth.signOut({ scope: "local" });
      return finish("/login?error=domain");
    }
    const ensured = await supabase.rpc("ensure_member");
    if (ensured.error) return finish("/login?error=membership");
    const member = await supabase
      .from("members")
      .select("id,email,display_name,status,is_admin")
      .eq("id", user.id)
      .single();
    if (member.error) return finish("/login?error=membership");
    return finish(destination(member.data as Member));
  } catch {
    return finish("/login?error=signin");
  }
}
