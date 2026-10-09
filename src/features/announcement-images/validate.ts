import "server-only";
import sharp from "sharp";
export const MAX_IMAGE_BYTES = 1024 * 1024;
export async function normalizeJpeg(file: File) {
  if (file.type !== "image/jpeg" || !file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose a prepared JPEG image smaller than 1 MB.");
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, {
      limitInputPixels: 1600 * 1600,
      failOn: "warning",
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== "jpeg" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 1600 ||
      metadata.height > 1600
    )
      throw new Error("Invalid image");
    // Decode/re-encode to reject corrupt payloads and strip all embedded metadata.
    const jpeg = await image
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    if (jpeg.length > MAX_IMAGE_BYTES) throw new Error("Invalid image");
    return jpeg;
  } catch {
    throw new Error(
      "This image is invalid or too large. Choose it again or use a smaller image.",
    );
  }
}
