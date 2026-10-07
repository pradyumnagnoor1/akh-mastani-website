import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  config: vi.fn(),
  createClient: vi.fn(),
  fetchCalendar: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/features/identity/session", () => ({
  requireMember: mocks.requireMember,
}));
vi.mock("@/lib/config", () => ({
  supabaseConfig: () => ({
    url: "https://example.supabase.co",
    key: "publishable",
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../src/features/calendar/config", () => ({
  calendarConfig: mocks.config,
}));
vi.mock("../src/features/calendar/google", () => ({
  fetchCalendar: mocks.fetchCalendar,
  CalendarFailure: class extends Error {
    code = "upstream";
  },
}));
import {
  calendarData,
  CalendarAccessError,
} from "../src/features/calendar/queries";
const snapshot = {
  source_fingerprint: "source",
  events: [],
  last_success_at: new Date(Date.now() - 600_000).toISOString(),
  last_error: null,
  lease_until: null,
  window_start: "2026-01-01T00:00:00Z",
  window_end: "2027-01-01T00:00:00Z",
};
let active: ReturnType<typeof vi.fn>,
  read: ReturnType<typeof vi.fn>,
  write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    source: "source",
    secretKey: "secret",
    calendarId: "id",
    clientId: "client",
    clientSecret: "secret",
    refreshToken: "refresh",
  });
  active = vi.fn().mockResolvedValue({ data: true, error: null });
  read = vi.fn().mockResolvedValue({ data: snapshot, error: null });
  write = vi.fn().mockResolvedValue({
    data: null,
    error: { message: "database details must not leak" },
  });
  const chain = { select: () => chain, eq: () => chain, maybeSingle: read };
  mocks.requireMember.mockResolvedValue({
    member: { id: "member" },
    supabase: { rpc: active, from: () => chain },
  });
  mocks.createClient.mockReturnValue({ rpc: write });
});
it("keeps usable cache on claim failure after checking current membership again", async () => {
  const { calendar } = await calendarData();
  expect(calendar).toMatchObject({
    lastSuccessAt: snapshot.last_success_at,
    error: "storage",
    unavailable: false,
  });
  expect(active).toHaveBeenCalledTimes(2);
  expect(mocks.fetchCalendar).not.toHaveBeenCalled();
});
it("fails closed if membership is revoked while a refresh is in progress", async () => {
  active
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: false, error: null });
  await expect(calendarData()).rejects.toBeInstanceOf(CalendarAccessError);
});
it("never returns a previous source cache when new-source claim fails", async () => {
  mocks.config.mockReturnValue({ source: "new-source", secretKey: "secret" });
  expect((await calendarData()).calendar).toMatchObject({
    unavailable: true,
    lastSuccessAt: null,
    events: [],
  });
});
it("fresh cache performs no privileged or Google calls", async () => {
  read.mockResolvedValue({
    data: { ...snapshot, last_success_at: new Date().toISOString() },
    error: null,
  });
  expect((await calendarData()).calendar.stale).toBe(false);
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(mocks.fetchCalendar).not.toHaveBeenCalled();
});
it("missing configuration returns an honest unavailable state without cache access", async () => {
  mocks.config.mockReturnValue(null);
  expect((await calendarData()).calendar).toMatchObject({
    configured: false,
    unavailable: true,
    events: [],
  });
  expect(read).not.toHaveBeenCalled();
});
