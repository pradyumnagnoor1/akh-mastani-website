import type { ReleaseUpdate } from "@/features/updates/queries";

export function ReleaseUpdates({ releases }: { releases: ReleaseUpdate[] }) {
  return (
    <div className="stack">
      {releases.map((release) => (
        <article className="panel" key={release.version}>
          <div className="section-toolbar">
            <h2>v{release.version}</h2>
            {release.releasedOn ? (
              <time dateTime={release.releasedOn}>{release.releasedOn}</time>
            ) : (
              <span className="badge">Upcoming release</span>
            )}
          </div>
          <p>{release.summary}</p>
          <ul>
            {release.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
