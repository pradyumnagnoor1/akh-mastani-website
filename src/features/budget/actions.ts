"use server";
import { revalidatePath } from "next/cache";
import { requireBudget, requireExpenseSubmitter } from "./queries";
import { cents } from "./policy";
import { type BudgetState } from "./types";
import {
  parseBudgetSetup,
  parsePlannedExpenses,
  type AllocationEntry,
  type PlannedEntry,
} from "./setup";
import { validateImportRows, type ImportRow } from "./import";
import { validVersion } from "@/features/communication/policy";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function mutateBudget(
  _state: BudgetState,
  form: FormData,
): Promise<BudgetState> {
  const isExpenseSubmission = value(form, "operation") === "submit";
  const { supabase, role } = isExpenseSubmission
    ? await requireExpenseSubmitter()
    : await requireBudget();
  try {
    const operation = value(form, "operation"),
      id = value(form, "id"),
      version = Number(value(form, "version"));
    validVersion(id, version);
    const payload: Record<string, unknown> = {
      operation,
      id,
      version,
      note: value(form, "note"),
    };
    if (operation === "season") {
      const setup = parseBudgetSetup(
        value(form, "name"),
        JSON.parse(value(form, "allocations")) as AllocationEntry[],
      );
      const planned = parsePlannedExpenses(
        JSON.parse(value(form, "planned_expenses")) as PlannedEntry[],
        setup.allocations,
      );
      Object.assign(payload, {
        name: setup.name,
        limit_cents: setup.totalCents,
        allocations: setup.allocations,
        planned_expenses: planned,
      });
    } else if (operation === "balance")
      Object.assign(payload, {
        fund_id: value(form, "fund_id"),
        amount_cents: cents(value(form, "amount"), true),
      });
    else if (operation === "submit") {
      const total = cents(value(form, "total")),
        status = value(form, "payment_status");
      Object.assign(payload, {
        season_id: value(form, "season_id"),
        title: value(form, "title"),
        category: value(form, "category"),
        fund_id: value(form, "fund_id"),
        total_cents: total,
        reported_cents:
          status === "paid"
            ? total
            : status === "partial"
              ? cents(value(form, "paid"))
              : 0,
        included_in_balance: form.get("included") === "on",
        notes: value(form, "notes"),
        due_on: value(form, "due_on"),
      });
      const receipt = form.get("receipt");
      if (receipt instanceof File && receipt.size) {
        if (receipt.size > 2 * 1024 * 1024)
          throw new Error("Choose a receipt smaller than 2 MB.");
        const bytes = Buffer.from(await receipt.arrayBuffer());
        const mime =
          bytes.subarray(0, 5).toString() === "%PDF-"
            ? "application/pdf"
            : bytes
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              ? "image/png"
              : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
                ? "image/jpeg"
                : null;
        if (!mime) throw new Error("Choose a PDF, JPEG, or PNG receipt.");
        payload.receipt = {
          filename: receipt.name.slice(0, 160),
          mime,
          content: bytes.toString("base64"),
        };
      }
    } else if (operation === "payment" || operation === "refund")
      Object.assign(payload, {
        amount_cents: cents(value(form, "amount")),
        included_in_balance: form.get("included") === "on",
      });
    const { error } = await supabase.rpc("budget_mutate", { payload });
    if (error) {
      if (error.code === "23505")
        return {
          error:
            "This entry was already saved. Close this form and refresh to see it.",
        };
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "Unable to confirm the save. Refresh before retrying; it may already be saved.",
      };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to confirm the save. Refresh before retrying.",
    };
  }
  revalidatePath("/budget");
  if (isExpenseSubmission) revalidatePath("/expenses/new");
  return {
    success:
      role === "exec"
        ? "Expense sent to Captains and Logistics & Finance for review."
        : "Saved. Budget and funds are up to date.",
  };
}
export async function importBudget(
  _state: BudgetState,
  form: FormData,
): Promise<BudgetState> {
  const { supabase, role } = await requireBudget();
  if (role !== "finance" && role !== "owner")
    return { error: "Finance or owner access required." };
  try {
    const seasonId = value(form, "season_id");
    validVersion(seasonId, 0);
    const rows = JSON.parse(value(form, "rows")) as ImportRow[];
    const { data: allowed, error: categoriesError } = await supabase
      .from("budget_allocations")
      .select("category")
      .eq("season_id", seasonId);
    if (categoriesError || !allowed)
      throw new Error("Unable to verify the season categories.");
    validateImportRows(
      rows,
      allowed.map((item) => item.category),
    );
    const included = form.get("included") === "on";
    const items = rows.map((r) => ({
      id: r.id,
      season_id: seasonId,
      title: r.title,
      category: r.category,
      fund_id: r.fund_id,
      total_cents: cents(r.total),
      reported_cents: cents(r.paid),
      included_in_balance: included,
      notes: r.notes,
      due_on: "",
    }));
    const { error } = await supabase.rpc("budget_import", { items });
    if (error)
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "Import could not be confirmed. Refresh before retrying; it may already have completed.",
      };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to read the import.",
    };
  }
  revalidatePath("/budget");
  return {
    success:
      "Expenses imported. Each one needs approval before payments affect balances.",
  };
}
