import { randomUUID } from "node:crypto";
import { requireExpenseSubmitter } from "@/features/budget/queries";
import { ExpenseSubmission } from "@/components/budget/expense-submission";
import "@/components/budget/budget.css";

export default async function Page() {
  const { supabase } = await requireExpenseSubmitter();
  const { data, error } = await supabase.rpc("budget_submission_season");
  if (error) throw new Error("Expense submission is unavailable right now.");
  return (
    <ExpenseSubmission
      seasonId={data as string | null}
      draftId={randomUUID()}
    />
  );
}
