import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cleanup: vi.fn(),
  push: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
  calendar: vi.fn(),
}));
vi.mock("@/features/calendar/queries", () => ({
  calendarData: mocks.calendar,
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.calendar.mockResolvedValue({ calendar: {} });
});

it("refreshes an aged Google schedule before saving the selected practice", async () => {
  const form = draft();
  form.set("practice_id", "weekly@2026-11-01T00:00:00Z");
  form.set("calendar_source", "original-source");
  let fresh = false;
  mocks.calendar.mockImplementation(async () => {
    fresh = true;
    return {
      calendar: {
        source: "source",
        configured: true,
        stale: false,
        error: null,
      },
    };
  });
  mocks.rpc.mockImplementation(async (_name, args) => {
    expect(fresh).toBe(true);
    expect(args).toMatchObject({
      practice_id: form.get("practice_id"),
      calendar_source: "original-source",
    });
    return { error: null };
  });
  await saveCommunication({ error: null }, form);
  expect(mocks.calendar).toHaveBeenCalledTimes(1);
  expect(mocks.redirect).toHaveBeenCalled();
});

it("preserves the draft without publishing if calendar refresh throws", async () => {
  const form = draft();
  form.set("practice_id", "practice");
  form.set("calendar_source", "source");
  mocks.calendar.mockRejectedValue(new Error("private provider error"));
  expect((await saveCommunication({ error: null }, form)).error).toContain(
    "Your message has been kept",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("does not require Google for custom practices or ordinary announcements", async () => {
  mocks.rpc.mockResolvedValue({ error: null });
  await saveCommunication({ error: null }, draft());
  const form = draft();
  form.set("practice_id", "custom:existing");
  form.set("calendar_source", "custom");
  await saveCommunication({ error: null }, form);
  expect(mocks.calendar).not.toHaveBeenCalled();
});
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

it("routes an announcement and new to-do through one transactional save", async () => {
  const form = draft();
  form.set("also_todo", "on");
  form.set("todo_id", "00000000-0000-4000-8000-000000000021");
  form.set("todo_mode", "shared");
  form.set("todo_due", "2026-11-01");
  mocks.rpc.mockResolvedValue({ error: null });
  await saveCommunication({ error: null }, form);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "save_announcement_with_todo",
    expect.objectContaining({
      todo_id: "00000000-0000-4000-8000-000000000021",
      todo_due: "2026-11-01",
      todo_mode: "shared",
      post_data: expect.objectContaining({
        post_kind: "announcement",
        post_title: "Practice",
      }),
    }),
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("explains expired Google authorization when SQL cannot validate the cached practice", async () => {
  const form = draft();
  form.set("practice_id", "weekly@2026-11-01T00:00:00Z");
  form.set("calendar_source", "source");
  mocks.calendar.mockResolvedValue({
    calendar: { configured: true, stale: true, error: "authorization" },
  });
  mocks.rpc.mockResolvedValue({
    error: {
      message:
        "Practice unavailable. Refresh the calendar and choose a practice",
    },
  });
  const result = await saveCommunication({ error: null }, form);
  expect(result.error).toContain(
    "Google Calendar authorization has expired or been revoked",
  );
  expect(result.error).toContain("Your message has been kept");
  expect(result.calendarReconnect).toBe(true);
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("keeps deletion/source-change validation errors when the calendar is healthy", async () => {
  const form = draft();
  form.set("practice_id", "removed");
  form.set("calendar_source", "source");
  mocks.calendar.mockResolvedValue({
    calendar: { source: "source", configured: true, stale: false, error: null },
  });
  mocks.rpc.mockResolvedValue({
    error: {
      message:
        "Practice unavailable. Refresh the calendar and choose a practice",
    },
  });
  const result = await saveCommunication({ error: null }, form);
  expect(result.error).toBe(
    "Practice unavailable. Refresh the calendar and choose a practice",
  );
  expect(result.calendarReconnect).toBeUndefined();
});

it.each([
  [{ configured: false, stale: true }, "not connected", true],
  [
    { configured: true, stale: true, refreshing: true },
    "is refreshing",
    undefined,
  ],
  [
    { configured: true, stale: true, error: "timeout" },
    "Try publishing again shortly",
    undefined,
  ],
])(
  "explains calendar recovery state %j",
  async (calendar, message, reconnect) => {
    const form = draft();
    form.set("practice_id", "practice");
    form.set("calendar_source", "source");
    mocks.calendar.mockResolvedValue({
      calendar: { source: "source", ...calendar },
    });
    mocks.rpc.mockResolvedValue({
      error: {
        message:
          "Practice unavailable. Refresh the calendar and choose a practice",
      },
    });
    const result = await saveCommunication({ error: null }, form);
    expect(result.error).toContain(message);
    expect(result.calendarReconnect).toBe(reconnect);
    expect(mocks.push).not.toHaveBeenCalled();
  },
);

it("returns updated choices after reconnect without silently relinking the submitted practice", async () => {
  const form = draft();
  form.set("practice_id", "practice");
  form.set("calendar_source", "old-source");
  const calendar = {
    source: "new-source",
    configured: true,
    stale: false,
    events: [],
  };
  mocks.calendar.mockResolvedValue({ calendar });
  mocks.rpc.mockResolvedValue({
    error: {
      message:
        "Practice unavailable. Refresh the calendar and choose a practice",
    },
  });
  const result = await saveCommunication({ error: null }, form);
  expect(result.error).toContain("Choose your practice again");
  expect(result.practiceCalendar).toEqual(calendar);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "save_announcement",
    expect.objectContaining({ calendar_source: "old-source" }),
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
