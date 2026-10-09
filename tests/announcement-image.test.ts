import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { imageDimensions } from "../src/features/announcement-images/dimensions";
vi.mock("server-only", () => ({}));
import { normalizeJpeg } from "../src/features/announcement-images/validate";
it("reads JPEG/PNG/WebP dimensions before decoding", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    expect(imageDimensions(bytes)).toEqual({ width: 320, height: 240 });
  }
});
it("rejects malformed and HEIF tile containers before allocating decoded pixels", () => {
  expect(() => imageDimensions(new Uint8Array([255, 216, 255]))).toThrow(
    /JPEG or PNG/,
  );
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(12);
  bytes.write("ftyp", 4);
  bytes.write("heic", 8);
  bytes.writeUInt32BE(20, 12);
  bytes.write("ispe", 16);
  bytes.writeUInt32BE(256, 24);
  bytes.writeUInt32BE(256, 28);
  bytes.writeUInt32BE(20, 32);
  bytes.write("ispe", 36);
  bytes.writeUInt32BE(12000, 44);
  bytes.writeUInt32BE(12000, 48);
  expect(() => imageDimensions(bytes)).toThrow(/JPEG or PNG/);
});
it("validates actual JPEG bytes and strips embedded metadata", async () => {
  const bytes = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "red" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  const output = await normalizeJpeg(
    new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" }),
  );
  const metadata = await sharp(output).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(metadata.exif).toBeUndefined();
  expect(output.length).toBeLessThan(bytes.length);
  await expect(
    normalizeJpeg(
      new File(["not an image"], "fake.jpg", { type: "image/jpeg" }),
    ),
  ).rejects.toThrow(/invalid/);
  const large = await sharp({
    create: { width: 1601, height: 10, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  await expect(
    normalizeJpeg(
      new File([new Uint8Array(large)], "large.jpg", { type: "image/jpeg" }),
    ),
  ).rejects.toThrow(/invalid/);
});
