import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cleanup: vi.fn(),
  push: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/features/identity/session", () => ({
  requireAnnouncementEditor: async () => ({ supabase: { rpc: mocks.rpc } }),
}));
vi.mock("@/features/announcement-images/cleanup", () => ({
  scheduleImageCleanup: mocks.cleanup,
}));
vi.mock("@/features/notifications/dispatch", () => ({
  schedulePush: mocks.push,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock(
  "@/features/expiration/policy",
  async () => await import("../src/features/expiration/policy"),
);
import { saveCommunication } from "../src/features/communication/actions";
function draft() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id: "00000000-0000-4000-8000-000000000020",
    version: "0",
    kind: "announcement",
    title: "Practice",
    body: "Wear black",
    mode: "individual",
    audience: "team",
    image_path: "private/image.jpg",
  }))
    form.set(key, value);
  return form;
}
beforeEach(() => vi.clearAllMocks());
it("gives image-specific recovery after a rejected attachment without reporting success or dispatching", async () => {
  mocks.rpc.mockResolvedValue({
    error: { code: "P0001", message: "Image unavailable. Choose it again" },
  });
  const result = await saveCommunication({ error: null }, draft());
  expect(result.error).toContain("Remove it and choose it again");
  expect(result.error).toContain("message has been kept");
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.cleanup).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("keeps uncertain-save guidance for an interrupted network call", async () => {
  mocks.rpc.mockRejectedValue(new Error("private transport detail"));
  const result = await saveCommunication({ error: null }, draft());
  expect(result.error).toContain("may already be saved");
  expect(result.error).not.toContain("private transport detail");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
