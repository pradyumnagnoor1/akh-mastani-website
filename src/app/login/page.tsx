import { Brand } from "@/components/brand";
import { SubmitButton } from "@/components/forms";
import { signIn } from "@/features/identity/actions";
import { authConfig } from "@/lib/config";
export const dynamic = "force-dynamic";
const messages: Record<string, string> = {
  domain: "Please sign in with your verified @tamu.edu Google account.",
  session: "Your session ended. Sign in again to continue.",
  signin: "Sign-in could not be completed. Please try again.",
  membership:
    "We could not load your membership. Please try again or contact your team admin.",
  configuration: "Team sign-in is not available yet.",
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = !!authConfig();
  return (
    <main id="main" className="sign-in-page">
      <section className="sign-in-card" aria-labelledby="sign-in-heading">
        <Brand />
        <h1 id="sign-in-heading">Team sign-in</h1>
        <p className="muted">Use your @tamu.edu Google account.</p>
        {error && (
          <p className="notice error" role="alert">
            {messages[error] ?? messages.signin}
          </p>
        )}
        {!configured && (
          <div className="notice">
            <strong>Sign-in is unavailable.</strong>
            <p>Contact your team admin to finish setup.</p>
          </div>
        )}
        <form action={signIn}>
          <SubmitButton
            disabled={!configured}
            pendingText="Connecting to Google…"
          >
            Continue with Google
          </SubmitButton>
        </form>
        <p className="sign-in-note">
          New members enter their name once and need admin approval.
        </p>
      </section>
    </main>
  );
}
