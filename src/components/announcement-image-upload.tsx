"use client";
import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/features/announcement-images/compress";
import {
  uploadAnnouncementImage,
  abandonAnnouncementImage,
} from "@/features/announcement-images/actions";
export function AnnouncementImageUpload({
  id,
  version,
  initialPath,
  initialDescription,
  onBusyChange,
}: {
  id: string;
  version: number;
  initialPath?: string | null;
  initialDescription?: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const [path, setPath] = useState(initialPath ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [preview, setPreview] = useState(
    initialPath ? `/announcements/${id}/image` : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState<number>();
  const staged = useRef("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (staged.current)
        void abandonAnnouncementImage(staged.current).catch(() => {});
    };
  }, []);
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function choose(file?: File) {
    if (!file || busy) return;
    setError("");
    setBusy(true);
    onBusyChange(true);
    try {
      const jpeg = await compressImage(file);
      if (!mounted.current) return;
      const form = new FormData();
      form.set("id", id);
      form.set("version", String(version));
      form.set("image", jpeg);
      const result = await uploadAnnouncementImage(form);
      if (result.error || !result.path)
        throw new Error(result.error || "Upload failed. Try again.");
      if (!mounted.current) {
        void abandonAnnouncementImage(result.path).catch(() => {});
        return;
      }
      if (staged.current)
        void abandonAnnouncementImage(staged.current).catch(() => {});
      staged.current = result.path;
      setPath(result.path);
      setPreview(URL.createObjectURL(jpeg));
      setSize(jpeg.size);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to prepare this image.",
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  return (
    <div className="stack" data-refresh-busy={busy}>
      <input type="hidden" name="image_path" value={path} />
      <label htmlFor="announcement-image">Attach an image (optional)</label>
      <input
        id="announcement-image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void choose(file);
        }}
      />
      <p className="muted small">
        Choose from Photos or Files. Images are converted to JPEG before upload;
        your original stays unchanged.
      </p>
      {busy && <p role="status">Preparing and uploading image…</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="announcement-image-preview"
            src={preview}
            alt={description || "Selected announcement image"}
          />
          {size && (
            <p className="muted small">
              Prepared JPEG · {Math.ceil(size / 1024)} KB
            </p>
          )}
          <label htmlFor="image-description">
            Image description (optional)
          </label>
          <input
            id="image-description"
            name="image_description"
            maxLength={200}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (staged.current)
                void abandonAnnouncementImage(staged.current).catch(() => {});
              staged.current = "";
              setPath("");
              setPreview("");
              setSize(undefined);
            }}
          >
            Remove image
          </button>
        </>
      )}
    </div>
  );
}
