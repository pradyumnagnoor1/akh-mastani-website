import Link from "next/link";
import { FolderOpen, Film } from "lucide-react";
import { choreoData } from "@/features/choreo/queries";
import { driveUrl } from "@/features/choreo/policy";
import { ChoreoVideos } from "@/components/choreo-videos";

export default async function Choreo() {
  const data = await choreoData();
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Choreo</h1>
          <p className="muted">Team dance videos from Google Drive.</p>
        </div>
        {
          <a
            className="button secondary"
            href={driveUrl(data.folder, true)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FolderOpen size={18} />
            Open folder
          </a>
        }
      </div>
      {data.status === "ready" ? (
        <ChoreoVideos videos={data.library.videos} />
      ) : (
        <section className="panel empty-state">
          <Film size={32} />
          <h2>
            {data.status === "setup"
              ? "Video folder not connected"
              : "Unable to load videos"}
          </h2>
          <p className="muted">
            {data.status === "setup"
              ? "Open the team folder to watch videos with your TAMU Google account. The video gallery will appear once the connection is ready."
              : data.error}
          </p>
          {data.status === "error" && (
            <Link href="/choreo" className="button secondary">
              Try again
            </Link>
          )}
        </section>
      )}
    </>
  );
}
