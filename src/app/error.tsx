"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="center-page">
      <section className="setup-card">
        <h1>We couldn’t load this.</h1>
        <p className="muted">
          Your changes may not have been saved. Please retry or check with your
          team admin.
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <a className="text-button" href="/login">
          Return to sign-in
        </a>
      </section>
    </main>
  );
}
