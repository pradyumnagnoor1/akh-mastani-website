import { describe, it, expect } from "vitest";
import {
  segmentName,
  selectedMembers,
  validatePdf,
  MAX_PDF_BYTES,
} from "../src/features/segments/policy";
describe("segments input policy", () => {
  it("normalizes names without losing international characters", () =>
    expect(segmentName("  Finale   रात  ")).toBe("Finale रात"));
  it.each(["", "   ", "x".repeat(101), "Finale\u0000"])(
    "rejects invalid names",
    (value) => expect(() => segmentName(value)).toThrow(),
  );
  it("deduplicates selected permanent member IDs", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(selectedMembers([id, id])).toEqual([id]);
  });
  it("rejects malformed IDs rather than interpreting names", () =>
    expect(() => selectedMembers(["Prady"])).toThrow());
  it("permits an empty lineup", () => expect(selectedMembers([])).toEqual([]));
});
describe("formation PDF validation", () => {
  it("accepts a small PDF with a valid signature", async () => {
    await expect(
      validatePdf(
        new File(["%PDF-1.7\nformation"], "formations.pdf", {
          type: "application/pdf",
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it("rejects renamed HTML even when MIME claims PDF", async () => {
    await expect(
      validatePdf(
        new File(["<html>bad</html>"], "formations.pdf", {
          type: "application/pdf",
        }),
      ),
    ).rejects.toThrow(/PDF/);
  });
  it("rejects non-PDF extension", async () => {
    await expect(
      validatePdf(
        new File(["%PDF-1.7"], "bad.html", { type: "application/pdf" }),
      ),
    ).rejects.toThrow(/PDF/);
  });
  it("rejects files larger than the upload limit", async () => {
    await expect(
      validatePdf(
        new File([new Uint8Array(MAX_PDF_BYTES + 1)], "big.pdf", {
          type: "application/pdf",
        }),
      ),
    ).rejects.toThrow(/4 MB/);
  });
  it("rejects empty uploads", async () => {
    await expect(
      validatePdf(new File([], "empty.pdf", { type: "application/pdf" })),
    ).rejects.toThrow();
  });
});
