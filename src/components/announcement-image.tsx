"use client";
import { useRef } from "react";
export function AnnouncementImage({
  id,
  description,
  path,
}: {
  id: string;
  description?: string;
  path?: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  if (!path) return null;
  const source = `/announcements/${id}/image?version=${encodeURIComponent(path)}`;
  const alt = description || "Announcement attachment";
  return (
    <>
      <button
        ref={button}
        className="announcement-image-button"
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label="Enlarge announcement image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="announcement-image-preview"
        />
      </button>
      <dialog
        ref={dialog}
        className="image-dialog"
        onClose={() => button.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className="button secondary"
          onClick={() => dialog.current?.close()}
        >
          Close image
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt={alt}
          loading="lazy"
          className="announcement-image-full"
        />
      </dialog>
    </>
  );
}
