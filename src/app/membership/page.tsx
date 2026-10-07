export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { identity } from "@/features/identity/session";
import { destination } from "@/features/identity/policy";
import { signOut } from "@/features/identity/actions";
import { Brand } from "@/components/brand";
export default async function Membership() {
  const { member, user } = await identity();
  if (!member) redirect("/onboarding");
  const next = destination(member);
  if (next !== "/membership") redirect(next);
  const inactive = member.status === "inactive";
  return (
    <main id="main" className="center-page">
      <Brand />
      <section className="setup-card">
        <div className="login-symbol">
          <Clock3 />
        </div>
        <p className="eyebrow">
          {inactive ? "MEMBERSHIP INACTIVE" : "APPROVAL PENDING"}
        </p>
        <h1>{inactive ? "Access deactivated" : "Awaiting approval"}</h1>
        <p className="muted">
          {inactive
            ? "Your team access has been deactivated. Contact your team admin if this is unexpected."
            : `Thanks, ${member.display_name}. Your name is saved. Your admin will confirm your membership before you can enter the team space.`}
        </p>
        <p className="identity-email">{user.email}</p>
        <Link href="/home" className="button primary">
          Check my access →
        </Link>
        <form action={signOut}>
          <button className="text-button">Sign out</button>
        </form>
      </section>
    </main>
  );
}
