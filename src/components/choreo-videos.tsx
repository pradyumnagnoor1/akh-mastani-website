"use client";
import { useState } from "react";
import { Film, Play, ExternalLink, X } from "lucide-react";
import { driveUrl, type ChoreoVideo } from "@/features/choreo/policy";

export function ChoreoVideos({ videos }: { videos: ChoreoVideo[] }) {
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const selected = videos.find((video) => video.id === playing);
  const visible = videos.filter((video) =>
    `${video.name} ${video.folder}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="section-toolbar choreo-toolbar">
        <div className="choreo-search">
          <label htmlFor="choreo-search">Find a video</label>
          <input
            id="choreo-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or folder"
          />
        </div>
        <span className="muted small">
          {videos.length} {videos.length === 1 ? "video" : "videos"}
        </span>
      </div>
      {selected && (
        <section className="panel choreo-player" aria-label="Video player">
          <div className="section-toolbar">
            <h2>{selected.name}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close video"
              onClick={() => setPlaying(null)}
            >
              <X size={20} />
            </button>
          </div>
          <iframe
            key={selected.id}
            src={driveUrl(selected, false, true)}
            title={`Choreo video: ${selected.name}`}
            allow="autoplay; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
          <p className="muted small">
            If playback asks you to sign in, use the Google account with access
            to the team folder.{" "}
            <a
              href={driveUrl(selected)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open video in Drive ↗
            </a>
          </p>
        </section>
      )}
      {visible.length ? (
        <div className="choreo-grid">
          {visible.map((video) => (
            <article className="panel choreo-card" key={video.id}>
              <div className="choreo-card-icon">
                <Film size={26} />
                {video.duration && (
                  <span className="badge">{video.duration}</span>
                )}
              </div>
              <div>
                <h2>{video.name}</h2>
                {video.folder && <p className="muted small">{video.folder}</p>}
              </div>
              <div className="actions">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    setPlaying(video.id);
                    requestAnimationFrame(() =>
                      document.querySelector(".choreo-player")?.scrollIntoView({
                        behavior: matchMedia("(prefers-reduced-motion: reduce)")
                          .matches
                          ? "instant"
                          : "smooth",
                        block: "start",
                      }),
                    );
                  }}
                >
                  <Play size={16} />
                  Watch<span className="sr-only"> {video.name}</span>
                </button>
                <a
                  className="button secondary"
                  href={driveUrl(video)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  Drive<span className="sr-only"> {video.name}</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel empty-state">
          <Film size={32} />
          <h2>
            {videos.length ? "No matching videos" : "No choreo videos yet"}
          </h2>
          <p className="muted">
            {videos.length
              ? "Try another name or folder."
              : "Videos added to the team Drive folder will appear here."}
          </p>
        </section>
      )}
    </>
  );
}
