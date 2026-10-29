import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireMember } from "@/features/identity/session";
import { collectPages } from "@/features/communication/pagination";
import type { BudgetData, BudgetRole } from "./types";
export async function requireBudget() {
  const context = await requireMember();
  const { data, error } = await context.supabase.rpc("budget_role");
  if (error)
    throw new Error(
      "Budget setup is unavailable. Please try again after setup is complete.",
    );
  if (data !== "finance" && data !== "captain" && data !== "owner")
    redirect("/home");
  return { ...context, role: data as BudgetRole };
}
export async function requireExpenseSubmitter() {
  const context = await requireMember();
  const { data, error } = await context.supabase.rpc("budget_role");
  if (error) throw new Error("Expense submission is unavailable right now.");
  if (!data || data === "none") redirect("/home");
  return { ...context, role: data as BudgetRole };
}
export const budgetData = cache(async () => {
  const context = await requireBudget();
  const tables = [
    "budget_funds",
    "budget_seasons",
    "budget_allocations",
    "budget_planned_expenses",
    "budget_expenses",
    "budget_events",
    "budget_receipts",
  ];
  const result = await Promise.all(
    tables.map((table) =>
      collectPages((from, to) =>
        context.supabase
          .from(table)
          .select(table === "budget_receipts" ? "expense_id,filename" : "*")
          .order(table === "budget_receipts" ? "expense_id" : "id")
          .range(from, to),
      ),
    ),
  );
  const [
    funds,
    seasons,
    allocations,
    plannedExpenses,
    expenses,
    events,
    receipts,
  ] = result;
  const allData = {
    funds,
    seasons,
    allocations,
    plannedExpenses,
    expenses,
    events,
    receipts,
  } as unknown as BudgetData;
  const visibleSeasons = allData.seasons.filter((season) => !season.deleted_at);
  const visibleIds = new Set(visibleSeasons.map((season) => season.id));
  return {
    ...context,
    data: {
      funds: allData.funds,
      seasons: visibleSeasons,
      allocations: allData.allocations.filter((item) =>
        visibleIds.has(item.season_id),
      ),
      plannedExpenses: allData.plannedExpenses.filter((item) =>
        visibleIds.has(item.season_id),
      ),
      expenses: allData.expenses.filter((item) =>
        visibleIds.has(item.season_id),
      ),
      events: allData.events.filter(
        (item) => !item.season_id || visibleIds.has(item.season_id),
      ),
      receipts: allData.receipts,
    },
  };
});
