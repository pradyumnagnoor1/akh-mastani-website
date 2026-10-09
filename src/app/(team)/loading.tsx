export default function LoadingTeamPage() {
  return (
    <section className="panel empty-state" role="status" aria-live="polite">
      <h1>Loading page…</h1>
      <p className="muted">Getting the latest team information.</p>
    </section>
  );
}
