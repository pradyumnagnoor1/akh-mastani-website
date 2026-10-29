"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Budget unavailable</h1>
      <p>
        We couldn’t load the budget. Your saved records have not changed. If
        this is the first release, the Budget database setup may still be
        pending.
      </p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
