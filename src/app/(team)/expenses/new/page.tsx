import { randomUUID } from "node:crypto";
import { requireExpenseSubmitter } from "@/features/budget/queries";
import { ExpenseSubmission } from "@/components/budget/expense-submission";
import { collectPages } from "@/features/communication/pagination";
import type { Expense } from "@/features/budget/types";
import "@/components/budget/budget.css";

export default async function Page() {
  const { supabase, member } = await requireExpenseSubmitter();
  const [
    { data, error },
    { data: categories, error: categoriesError },
    expenses,
  ] = await Promise.all([
    supabase.rpc("budget_submission_season"),
    supabase.rpc("budget_submission_categories"),
    collectPages((from, to) =>
      supabase
        .from("budget_expenses")
        .select("*")
        .eq("created_by", member.id)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);
  if (error || categoriesError)
    throw new Error("Expense submission is unavailable right now.");
  return (
    <ExpenseSubmission
      seasonId={data as string | null}
      draftId={randomUUID()}
      expenses={expenses as Expense[]}
      categories={categories as string[]}
    />
  );
}
