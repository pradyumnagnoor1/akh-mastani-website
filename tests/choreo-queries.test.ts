import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  config: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/features/identity/session", () => ({
  requireMember: mocks.member,
}));
vi.mock("../src/features/choreo/config", () => ({
  choreoConfig: mocks.config,
}));
vi.mock("../src/features/choreo/google", () => ({
  fetchChoreo: mocks.read,
  ChoreoFailure: class extends Error {},
}));
import { choreoData } from "../src/features/choreo/queries";
const ownerFolder = "15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.member.mockResolvedValue({ member: { id: "dancer" } });
  vi.stubEnv("GOOGLE_DRIVE_CHOREO_FOLDER", "");
});
afterEach(() => vi.unstubAllEnvs());
it("denies unauthorized members before touching configuration or Drive", async () => {
  mocks.member.mockRejectedValue(new Error("membership denied"));
  await expect(choreoData()).rejects.toThrow("membership denied");
  expect(mocks.config).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it("returns the safe owner folder and a recovery state for malformed folder configuration", async () => {
  vi.stubEnv("GOOGLE_DRIVE_CHOREO_FOLDER", "https://evil.test/folder");
  const result = await choreoData();
  expect(result).toMatchObject({
    status: "error",
    folder: { id: ownerFolder },
  });
  expect(JSON.stringify(result)).not.toContain("evil.test");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("keeps the configured valid folder available even while credentials are missing", async () => {
  vi.stubEnv(
    "GOOGLE_DRIVE_CHOREO_FOLDER",
    "https://drive.google.com/drive/folders/another_folder_123",
  );
  mocks.config.mockReturnValue(null);
  expect(await choreoData()).toMatchObject({
    status: "setup",
    folder: { id: "another_folder_123" },
  });
  expect(mocks.read).not.toHaveBeenCalled();
});
