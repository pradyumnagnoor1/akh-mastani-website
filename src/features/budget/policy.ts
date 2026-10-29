import type { BudgetRole, Expense } from "./types";
export const canReview = (role: BudgetRole) =>
  ["captain", "finance", "owner"].includes(role);
export const canManage = (role: BudgetRole) =>
  ["finance", "owner"].includes(role);
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function cents(value: string, signed = false) {
  if (
    !(signed ? /^-?\d{1,7}(\.\d{1,2})?$/ : /^\d{1,7}(\.\d{1,2})?$/).test(
      value.trim(),
    )
  )
    throw new Error("Enter a dollar amount with at most two decimal places.");
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 100000000)
    throw new Error("Amount must be at most $1,000,000.");
  return n;
}
export function totals(expenses: Expense[]) {
  return expenses.reduce(
    (a, e) => ({
      paid: a.paid + e.paid_cents - e.refunded_cents,
      reserved: a.reserved + e.total_cents - e.paid_cents,
      pending:
        a.pending +
        (e.status !== "approved" ? e.total_cents - e.paid_cents : 0),
    }),
    { paid: 0, reserved: 0, pending: 0 },
  );
}
export const eligibleFund = (fund: string, category: string) =>
  fund !== "goodbull" || ["Hotel", "Travel"].includes(category);
