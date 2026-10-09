import { imageDimensions } from "./dimensions";
/** Browser-only preparation. No original image is uploaded. */
export async function compressImage(file: File): Promise<File> {
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Choose an image smaller than 20 MB.");
  const dimensions = imageDimensions(new Uint8Array(await file.arrayBuffer()));
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width * dimensions.height > 20_000_000
  )
    throw new Error(
      "Choose a photo smaller than 20 megapixels. Export a smaller JPEG from Photos first.",
    );
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(
        "This image cannot be converted on this phone. Choose a JPEG or PNG from Photos or Files.",
      );
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 20_000_000
    )
      throw new Error(
        "This image is too large to prepare. Choose a smaller photo.",
      );
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Unable to prepare the image. Try another browser.");
    let best: Blob | null = null;
    for (const edge of [1600, 1280, 1024]) {
      const scale = Math.min(
        1,
        edge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.75, 0.65]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (!blob || blob.type !== "image/jpeg")
          throw new Error("Unable to convert this image to JPEG.");
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= 500 * 1024)
          return new File([blob], "announcement.jpg", { type: "image/jpeg" });
      }
    }
    if (!best || best.size > 1024 * 1024)
      throw new Error(
        "This image is still too large. Choose a simpler or smaller image.",
      );
    return new File([best], "announcement.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
