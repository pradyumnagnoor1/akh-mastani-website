import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { cleanupFormationFiles } from "../src/features/segments/cleanup";
beforeEach(() => vi.clearAllMocks());
it("retains a durable cleanup job when Storage deletion fails", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: ["admin/file.pdf"], error: null });
  mocks.remove.mockResolvedValue({ error: { message: "unavailable" } });
  await expect(cleanupFormationFiles()).rejects.toThrow(
    "File cleanup unavailable",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("finishes only after Storage acknowledges deletion; absent bytes can be retried", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: ["admin/file.pdf"], error: null })
    .mockResolvedValueOnce({ error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  await cleanupFormationFiles();
  expect(mocks.remove).toHaveBeenCalledWith(["admin/file.pdf"]);
  expect(mocks.rpc).toHaveBeenLastCalledWith("finish_formation_cleanup", {
    p_paths: ["admin/file.pdf"],
  });
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.rpc.mock.invocationCallOrder[1],
  );
});
