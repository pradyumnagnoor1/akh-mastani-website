import { budgetData } from "@/features/budget/queries";
import { BudgetWorkspace } from "@/components/budget/workspace";
import "@/components/budget/budget.css";
export default async function Page() {
  const { data, member, role } = await budgetData();
  return <BudgetWorkspace data={data} memberId={member.id} role={role} />;
}
