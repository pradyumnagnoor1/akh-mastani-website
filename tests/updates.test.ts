import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ member: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/identity/session", () => ({
  requireMember: auth.member,
  requireAdmin: auth.admin,
}));
import { adminUpdates, memberUpdates } from "../src/features/updates/queries";
beforeEach(() => vi.resetAllMocks());
it("requires active membership before returning member release notes", async () => {
  auth.member.mockRejectedValue(new Error("membership required"));
  await expect(memberUpdates()).rejects.toThrow("membership required");
});
it("does not return admin content when management authorization fails", async () => {
  auth.admin.mockRejectedValue(new Error("management required"));
  await expect(adminUpdates()).rejects.toThrow("management required");
});
it("returns separate version 2.1 notes after authorization", async () => {
  const [member, admin] = await Promise.all([memberUpdates(), adminUpdates()]);
  expect(auth.member).toHaveBeenCalledOnce();
  expect(auth.admin).toHaveBeenCalledOnce();
  expect(member[0].version).toBe("2.1");
  expect(admin[0].version).toBe("2.1");
  expect(member[0].summary).not.toBe(admin[0].summary);
  expect(member[0].releasedOn).toBe("2026-11-04");
});
