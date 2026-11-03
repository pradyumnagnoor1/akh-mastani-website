vi.mock(
  "@/features/identity/session",
  () => import("../src/features/identity/session"),
);
vi.mock(
  "@/features/communication/pagination",
  () => import("../src/features/communication/pagination"),
);
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
const m = vi.hoisted(() => ({ user: vi.fn(), member: vi.fn(), rpc: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/config", () => ({ supabaseConfig: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.user },
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.member }) }) }),
  }),
}));
import {
  requireBudget,
  requireExpenseSubmitter,
} from "../src/features/budget/queries";
import { requireMember } from "../src/features/identity/session";
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({
    data: {
      user: {
        id: "user",
        email: "user@tamu.edu",
        email_confirmed_at: "today",
        app_metadata: { provider: "google" },
      },
    },
    error: null,
  });
  m.member.mockResolvedValue({
    data: {
      id: "user",
      display_name: "Test User",
      status: "active",
      is_admin: false,
      exec_roles: ["Captain"],
    },
    error: null,
  });
  m.rpc.mockResolvedValue({ data: "captain", error: null });
});
it("reuses the authenticated permission lookup instead of a second RPC", async () => {
  expect((await requireBudget()).role).toBe("captain");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("starts membership and permission reads together after authenticating", async () => {
  let release!: (value: unknown) => void;
  m.member.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = requireMember();
  await vi.waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
  release({
    data: {
      id: "user",
      display_name: "Test User",
      status: "active",
      is_admin: false,
      exec_roles: [],
    },
    error: null,
  });
  await pending;
});
it("keeps role errors closed for finance while allowing the other team pages", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
  expect((await requireMember()).member.budget_role).toBe("none");
  await expect(requireBudget()).rejects.toThrow("Budget setup is unavailable");
  await expect(requireExpenseSubmitter()).rejects.toThrow(
    "Expense submission is unavailable",
  );
});
it("does not turn an exec request permission into permission to read budget", async () => {
  m.rpc.mockResolvedValue({ data: "exec", error: null });
  await expect(requireBudget()).rejects.toThrow("redirect:/home");
  expect((await requireExpenseSubmitter()).role).toBe("exec");
});
it("rechecks identity on a new call and rejects invalid sessions before private reads", async () => {
  await requireBudget();
  m.user.mockResolvedValue({ data: { user: null }, error: {} });
  await expect(requireBudget()).rejects.toThrow("redirect:/login");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
