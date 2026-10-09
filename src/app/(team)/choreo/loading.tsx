import { FolderOpen } from "lucide-react";
export default function LoadingChoreo() {
  return (
    <>
      <div className="page-heading">
        <h1>Choreo</h1>
        <p className="muted">Open a folder to watch team dance videos.</p>
      </div>
      <section className="panel empty-state" role="status">
        <FolderOpen size={32} />
        <h2>Loading folders…</h2>
        <p className="muted">Connecting to Google Drive.</p>
      </section>
    </>
  );
}
