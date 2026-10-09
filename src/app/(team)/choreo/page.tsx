import Link from "next/link";
import { Suspense } from "react";
import { FolderOpen, Film } from "lucide-react";
import { choreoData } from "@/features/choreo/queries";
import { driveUrl } from "@/features/choreo/policy";
import { ChoreoVideos } from "@/components/choreo-videos";
import type { ChoreoBrowse } from "@/features/choreo/google";

function browseUrl(path: string[], cursor?: string, rootVideos = false) {
  const params = new URLSearchParams();
  if (path.length) params.set("path", path.join("/"));
  if (cursor) params.set("cursor", cursor);
  if (rootVideos) params.set("videos", "1");
  return `/choreo${params.size ? `?${params}` : ""}`;
}

async function FolderContents({ browse }: { browse: ChoreoBrowse }) {
  const data = await choreoData(browse);
  const path = browse.path ?? [];
  if (data.status !== "ready")
    return (
      <section className="panel empty-state">
        <Film size={32} />
        <h2>
          {data.status === "setup"
            ? "Video folder not connected"
            : "Unable to load folder"}
        </h2>
        <p className="muted">
          {data.status === "setup"
            ? "Open the team folder with your TAMU Google account while the connection is being set up."
            : data.error}
        </p>
        <a
          className="button secondary"
          href={driveUrl(data.folder, true)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open folder in Drive
        </a>
        {data.status === "error" && (
          <Link href="/choreo" className="button secondary">
            Back to Choreo
          </Link>
        )}
      </section>
    );
  const library = data.library;
  return (
    <>
      <div className="section-toolbar">
        <nav aria-label="Choreo folders" className="actions">
          {library.breadcrumbs.map((folder, index) => (
            <Link
              key={folder.id}
              href={browseUrl(path.slice(0, index))}
              aria-current={
                index === library.breadcrumbs.length - 1 && !browse.rootVideos
                  ? "page"
                  : undefined
              }
            >
              {index === 0 ? "Choreo" : folder.name}
              {index < library.breadcrumbs.length - 1 ? " /" : ""}
            </Link>
          ))}
        </nav>
        <a
          className="button secondary"
          href={driveUrl(library.folder, true)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FolderOpen size={18} />
          Open folder in Drive
        </a>
      </div>
      {!!library.folders.length && (
        <>
          <h2>Folders</h2>
          <div className="choreo-grid">
            {library.folders.map((folder) => (
              <Link
                className="panel choreo-card"
                key={folder.id}
                href={browseUrl([...path, folder.id])}
              >
                <div className="choreo-card-icon">
                  <FolderOpen size={26} />
                </div>
                <h3>{folder.name}</h3>
                <span className="muted small">Open folder →</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {!path.length && !browse.rootVideos ? (
        <>
          {!library.folders.length && (
            <section className="panel empty-state">
              <FolderOpen size={32} />
              <h2>No choreo folders yet</h2>
              <p className="muted">
                Folders added to the team Drive folder will appear here.
              </p>
            </section>
          )}
          <Link
            className="button secondary"
            href={browseUrl([], undefined, true)}
          >
            Videos in the team folder
          </Link>
        </>
      ) : (
        <>
          <h2>{library.name} videos</h2>
          <ChoreoVideos
            key={browse.cursor ?? "newest"}
            videos={library.videos}
          />
          <div className="actions">
            {browse.cursor && (
              <Link
                className="button secondary"
                href={browseUrl(path, undefined, browse.rootVideos)}
              >
                Newest videos
              </Link>
            )}
            {library.nextCursor && (
              <Link
                className="button secondary"
                href={browseUrl(path, library.nextCursor, browse.rootVideos)}
                prefetch={false}
              >
                Next 5 videos
              </Link>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default async function Choreo({
  searchParams,
}: {
  searchParams: Promise<{
    path?: string | string[];
    cursor?: string | string[];
    videos?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const browse: ChoreoBrowse = {
    path: typeof params.path === "string" ? params.path.split("/") : [],
    cursor: typeof params.cursor === "string" ? params.cursor : undefined,
    rootVideos: params.videos === "1",
  };
  return (
    <>
      <div className="page-heading">
        <h1>Choreo</h1>
        <p className="muted">
          Open a folder to watch the newest team dance videos.
        </p>
      </div>
      <Suspense
        key={JSON.stringify(browse)}
        fallback={
          <section className="panel empty-state" role="status">
            <FolderOpen size={32} />
            <h2>Loading folder…</h2>
            <p className="muted">Getting your videos from Google Drive.</p>
          </section>
        }
      >
        <FolderContents browse={browse} />
      </Suspense>
    </>
  );
}
