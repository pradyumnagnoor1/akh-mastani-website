export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { NameForm } from "@/components/forms";
import { identity } from "@/features/identity/session";
import { destination } from "@/features/identity/policy";
import { signOut } from "@/features/identity/actions";
export default async function Onboarding() {
  const { user, member } = await identity();
  if (member?.display_name || member?.status === "inactive")
    redirect(destination(member));
  return (
    <main id="main" className="center-page">
      <Brand />
      <section className="setup-card">
        <h1>Enter your name</h1>
        <p className="muted">
          Your name connects your place on the roster with your segments, tasks,
          and payments.
        </p>
        <div className="identity-email">
          {user.email}
          <span className="badge">Google verified</span>
        </div>
        <NameForm />
        <form action={signOut}>
          <button className="text-button">Use another account</button>
        </form>
      </section>
    </main>
  );
}
