import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  communication: vi.fn(),
  payment: vi.fn(),
  segments: vi.fn(),
  calendar: vi.fn(),
  featured: vi.fn(),
}));
vi.mock("@/features/identity/session", () => ({ requireMember: m.auth }));
vi.mock("@/features/communication/queries", () => ({
  communicationData: m.communication,
}));
vi.mock("@/features/payments/queries", () => ({ paymentData: m.payment }));
vi.mock("@/features/segments/queries", () => ({ segmentData: m.segments }));
vi.mock("@/features/calendar/queries", () => ({ calendarData: m.calendar }));
vi.mock("@/features/featured-events/queries", () => ({
  featuredData: m.featured,
}));
import { digestData } from "../src/features/digest/queries";
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ member: { id: "a" } });
  m.communication.mockResolvedValue({ posts: [], recipients: [] });
  m.payment.mockResolvedValue({ charges: [] });
  m.segments.mockResolvedValue({ segments: [], assignments: [] });
  m.calendar.mockResolvedValue({
    calendar: {
      configured: true,
      unavailable: false,
      stale: false,
      events: [],
    },
  });
  m.featured.mockResolvedValue({ events: [] });
});
it("retains successful sources and reports unavailable data instead of claiming caught up", async () => {
  m.communication.mockRejectedValue(new Error("private backend detail"));
  const result = await digestData();
  expect(result.unavailable).toEqual(["Messages"]);
  expect(result.digest.items).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("private backend detail");
});
it("fails authentication before attempting source reads", async () => {
  m.auth.mockRejectedValue(new Error("redirect to login"));
  await expect(digestData()).rejects.toThrow("redirect to login");
  expect(m.communication).not.toHaveBeenCalled();
});
it("distinguishes stale schedule from unavailable schedule", async () => {
  m.calendar.mockResolvedValue({
    calendar: { configured: true, unavailable: true, stale: true, events: [] },
  });
  const result = await digestData();
  expect(result.unavailable).toContain("Practice calendar");
  expect(result.calendarStale).toBe(true);
});
