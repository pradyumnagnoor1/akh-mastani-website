import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  push: vi.fn(),
  cleanup: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
  upload: vi.fn(),
  readCurrent: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/features/identity/session", () => {
  const context = async () => ({
    supabase: {
      rpc: m.rpc,
      from: () => ({
        select: () => ({ eq: () => ({ single: m.readCurrent }) }),
      }),
      storage: { from: () => ({ upload: m.upload, remove: m.remove }) },
    },
    member: { id: "00000000-0000-4000-8000-000000000001", status: "active" },
  });
  return {
    requireAnnouncementEditor: context,
    requireAdmin: context,
    requireMember: context,
    identity: context,
  };
});
vi.mock("../src/features/identity/session", () => {
  const context = async () => ({
    supabase: {
      rpc: m.rpc,
      from: () => ({
        select: () => ({ eq: () => ({ single: m.readCurrent }) }),
      }),
      storage: { from: () => ({ upload: m.upload, remove: m.remove }) },
    },
    member: { id: "00000000-0000-4000-8000-000000000001", status: "active" },
  });
  return {
    requireAnnouncementEditor: context,
    requireAdmin: context,
    requireMember: context,
    identity: context,
  };
});
vi.mock("@/features/notifications/dispatch", () => ({ schedulePush: m.push }));
vi.mock("@/features/announcement-images/cleanup", () => ({
  scheduleImageCleanup: m.cleanup,
}));
vi.mock("../src/features/segments/cleanup", () => ({
  scheduleFormationCleanup: m.cleanup,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/config", () => ({
  authConfig: vi.fn(),
  supabaseConfig: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock(
  "@/features/expiration/policy",
  async () => await import("../src/features/expiration/policy"),
);
vi.mock(
  "@/features/communication/policy",
  async () => await import("../src/features/communication/policy"),
);
import {
  saveCommunication,
  completeCommunication,
  manageCommunication,
  saveGroup,
  archiveGroup,
} from "../src/features/communication/actions";
import {
  issuePayments,
  transitionPayment,
  managePaymentCharge,
} from "../src/features/payments/actions";
import {
  saveFeaturedEvent,
  deleteFeaturedEvent,
} from "../src/features/featured-events/actions";
import { saveSegment, removeSegment } from "../src/features/segments/actions";
import { saveName, manageMember } from "../src/features/identity/actions";
const id = "00000000-0000-4000-8000-000000000010";
const dancer = "00000000-0000-4000-8000-000000000002";
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version: "1",
    kind: "announcement",
    title: "Practice",
    body: "Bring shoes",
    audience: "team",
    mode: "individual",
    reason: "Costume",
    instructions: "Pay treasurer",
    amount: "10.50",
    note: "Reviewed",
    name: "Dancer Name",
    ...fields,
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockRejectedValue(new Error("private request body and token"));
  m.upload.mockResolvedValue({ error: null });
});
const cases = [
  ["publish", saveCommunication, () => form({ version: "0" })],
  ["edit communication", saveCommunication, () => form()],
  ["acknowledge/complete", completeCommunication, () => form()],
  ["reopen", manageCommunication, () => form({ operation: "reopen" })],
  [
    "delete communication",
    manageCommunication,
    () => form({ operation: "delete" }),
  ],
  [
    "save group",
    saveGroup,
    () => {
      const data = form();
      data.append("members", dancer);
      return data;
    },
  ],
  ["delete group", archiveGroup, () => form()],
  ["issue payment batch", issuePayments, () => form({ version: "0" })],
  ...["report", "verify", "reject", "waive"].map(
    (operation) =>
      [
        `payment ${operation}`,
        transitionPayment,
        () => form({ operation }),
      ] as const,
  ),
  ["edit charge", managePaymentCharge, () => form({ operation: "update" })],
  ["delete charge", managePaymentCharge, () => form({ operation: "delete" })],
  [
    "save featured",
    saveFeaturedEvent,
    () => form({ event_date: "2099-12-12" }),
  ],
  ["delete featured", deleteFeaturedEvent, () => form()],
  [
    "upload and create segment",
    saveSegment,
    () => {
      const data = form({ version: "0" });
      data.append("members", dancer);
      data.set(
        "pdf",
        new File(["%PDF-1.7\nFormation\n%%EOF"], "formation.pdf", {
          type: "application/pdf",
        }),
      );
      return data;
    },
  ],
  ["remove segment", removeSegment, () => form({ confirm: "yes" })],
  ["onboard name", saveName, () => form()],
  ["correct member name", manageMember, () => form({ operation: "name" })],
  ["approve member", manageMember, () => form({ operation: "active" })],
  ["deactivate member", manageMember, () => form({ operation: "inactive" })],
] as const;
it.each(cases)(
  "%s returns recoverable uncertainty on transport failure without reporting success",
  async (_name, action, makeForm) => {
    const result = await action({ error: null }, makeForm());
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(result.error).toMatch(/confirm|Refresh/);
    expect(result.error).not.toContain("private request body");
    expect("success" in result && result.success).toBeFalsy();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.cleanup).not.toHaveBeenCalled();
    expect(m.revalidate).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  },
);

it("keeps an existing segment draft recoverable if metadata preflight throws before any write", async () => {
  m.readCurrent.mockRejectedValue(
    new Error("private metadata request details"),
  );
  const result = await saveSegment({ error: null }, form());
  expect(result.error).toContain("Unable to load");
  expect(result.error).not.toContain("private metadata");
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.redirect).not.toHaveBeenCalled();
});
