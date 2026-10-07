import { describe, it, expect } from "vitest";
import {
  isTamuEmail,
  normalizeName,
  destination,
  type Member,
} from "../src/features/identity/policy";
const dancer: Member = {
  id: "id",
  email: "dancer@tamu.edu",
  display_name: "Dancer",
  status: "active",
  is_admin: false,
};
describe("TAMU eligibility", () => {
  it("accepts only the exact domain, case-insensitively", () => {
    expect(isTamuEmail("dancer@tamu.edu")).toBe(true);
    expect(isTamuEmail("Dancer@TAMU.EDU")).toBe(true);
  });
  it.each([
    "dancer@gmail.com",
    "dancer@tamu.edu.evil.com",
    "dancer@sub.tamu.edu",
    "@tamu.edu",
    "a@@tamu.edu",
    "a b@tamu.edu",
    "a@tamu.edu\n",
    undefined,
    null,
  ])("rejects invalid identity %s", (email) =>
    expect(isTamuEmail(email)).toBe(false),
  );
});
describe("onboarding name", () => {
  it("normalizes whitespace and preserves international names", () =>
    expect(normalizeName("  Ana   María  ")).toBe("Ana María"));
  it.each(["", " ", "a".repeat(81), "Ada\u0000Lovelace"])(
    "rejects empty, oversized and control characters",
    (name) => expect(() => normalizeName(name)).toThrow(),
  );
});
describe("membership destinations", () => {
  it("routes new members to onboarding", () =>
    expect(
      destination({ ...dancer, display_name: null, status: "pending" }),
    ).toBe("/onboarding"));
  it("routes pending profiles to approval status", () =>
    expect(destination({ ...dancer, status: "pending" })).toBe("/membership"));
  it("blocks inactive profiles even without a name", () =>
    expect(
      destination({ ...dancer, status: "inactive", display_name: null }),
    ).toBe("/membership"));
  it("keeps admins on the dancer home", () => {
    expect(destination(dancer)).toBe("/home");
    expect(destination({ ...dancer, is_admin: true })).toBe("/home");
  });
  it("requires login without a profile", () =>
    expect(destination(null)).toBe("/login"));
});
