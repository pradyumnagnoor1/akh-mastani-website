import { it, expect } from "vitest";
import { collectPages } from "../src/features/communication/pagination";
it("collects every row past the API page cap", async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  expect(
    await collectPages(async (from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
    })),
  ).toEqual(rows);
});
it("fails instead of showing a partially loaded audience", async () => {
  await expect(
    collectPages(async (from) =>
      from
        ? { data: null, error: new Error("offline") }
        : { data: Array(500).fill(1), error: null },
    ),
  ).rejects.toThrow(/load/);
});
