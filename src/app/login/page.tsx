import { ArrowUpRight, ShieldCheck, Music2, Sparkles } from "lucide-react";
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
    <main id="main" className="login-layout">
      <section className="login-story">
        <Brand />
        <div className="story-body">
          <div className="eyebrow">
            <span className="small-star">✦</span> THE AKH MASTANI TEAM SPACE
          </div>
          <h1>
            Many dancers.
            <br />
            One <em>rhythm.</em>
          </h1>
          <p>
            Everything that keeps us in step.
            <br />
            From the first practice to the final bow.
          </p>
          <div className="rhythm-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <span className="art-star">✦</span>
            <span className="art-caption">MOVE AS ONE</span>
          </div>
        </div>
        <footer className="story-footer">
          <span>TEXAS A&M UNIVERSITY</span>
          <span>
            EST. IN PASSION <ArrowUpRight size={14} />
          </span>
        </footer>
      </section>
      <section className="login-panel">
        <div className="login-top">
          <span className="pill">
            <span className="status-dot" /> YOUR TEAM. YOUR SPACE.
          </span>
        </div>
        <div className="login-form">
          <div className="login-symbol">
            <Music2 size={26} />
          </div>
          <p className="eyebrow">WELCOME TO THE TEAM HUB</p>
          <h2>
            Good to have
            <br />
            you here.
          </h2>
          <p className="intro">
            Sign in to find your people, your formations,
            <br className="desktop-break" /> and what’s next for the team.
          </p>
          {error && (
            <p className="notice error" role="alert">
              {messages[error] ?? messages.signin}
            </p>
          )}
          {!configured && (
            <div className="notice">
              <strong>We’re getting the team space ready.</strong>
              <p>
                Google sign-in will be available once your team admin finishes
                setup.
              </p>
            </div>
          )}
          <form action={signIn}>
            <SubmitButton
              disabled={!configured}
              pendingText="Connecting to Google…"
            >
              <span className="google-letter" aria-hidden="true">
                G
              </span>
              Continue with Google <ArrowUpRight size={18} />
            </SubmitButton>
          </form>
          <p className="login-help">
            <ShieldCheck size={16} />
            Use your <strong>@tamu.edu</strong> account
          </p>
          <div className="login-divider" />
          <div className="onboarding-hint">
            <Sparkles size={19} />
            <p>
              <strong>First time here?</strong>
              <br />
              We’ll ask for your name, then your admin will confirm your team
              access.
            </p>
          </div>
        </div>
        <footer className="login-footer">
          A little less organizing. A lot more dancing.<span>AKH MASTANI</span>
        </footer>
      </section>
    </main>
  );
}
