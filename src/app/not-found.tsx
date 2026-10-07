import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="center-page">
      <section className="setup-card">
        <p className="eyebrow">404</p>
        <h1>This page isn’t here.</h1>
        <Link className="button primary" href="/home">
          Back to the team space →
        </Link>
      </section>
    </main>
  );
}
