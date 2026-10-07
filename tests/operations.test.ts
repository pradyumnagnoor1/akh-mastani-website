import { describe, it, expect, vi } from "vitest";
import { EXPORT_TABLES, readExport } from "../src/features/operations/export";
describe("operational export", () => {
  it("pages every table without auth data and retains terminal payments", async () => {
    const read = vi.fn(async (table: string, from: number) => ({
      data:
        table === "payment_charges"
          ? from === 0
            ? Array.from({ length: 500 }, (_, id) => ({
                id,
                status: "verified",
              }))
            : [{ id: 501, status: "waived" }]
          : [],
      error: null,
    }));
    const result = await readExport(read);
    expect(result.tables.payment_charges).toHaveLength(501);
    expect(Object.keys(result.tables)).toEqual(Object.keys(EXPORT_TABLES));
    expect(result.tables.auth).toBeUndefined();
  });
  it("rejects partial or oversized exports", async () => {
    await expect(
      readExport(async () => ({ data: null, error: new Error("denied") })),
    ).rejects.toThrow("Export unavailable");
    await expect(
      readExport(async () => ({ data: ["x".repeat(3_000_001)], error: null })),
    ).rejects.toThrow("too large");
  });
});
