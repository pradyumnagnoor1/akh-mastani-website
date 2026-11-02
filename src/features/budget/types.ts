export const CATEGORIES = [
  "Production",
  "Competition",
  "Legends/Application",
  "Travel",
  "Hotel",
  "Security Deposit",
  "Misc.",
  "Mix",
  "Social",
] as const;
export type BudgetRole = "none" | "exec" | "captain" | "finance" | "owner";
export type Fund = {
  id: string;
  name: string;
  balance_cents: number;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
};
export type Season = {
  id: string;
  name: string;
  limit_cents: number;
  original_cents: number;
  version: number;
  created_at: string;
  deleted_at: string | null;
};
export type Allocation = {
  id: string;
  season_id: string;
  category: string;
  limit_cents: number;
  original_cents: number;
  version: number;
};
export type PlannedExpense = {
  id: string;
  season_id: string;
  category: string;
  name: string;
  amount_cents: number;
  request_deduction: boolean;
  fund_id: string | null;
  included_in_balance: boolean;
};
export type Expense = {
  is_request?: boolean;
  request_approved_at?: string | null;
  id: string;
  season_id: string;
  category: string;
  fund_id: string | null;
  title: string;
  total_cents: number;
  paid_cents: number;
  reported_cents: number;
  refunded_cents: number;
  pending_refund_cents: number;
  refund_included_in_balance: boolean;
  included_in_balance: boolean;
  status: "pending" | "approved" | "changes";
  notes: string;
  due_on: string | null;
  submitted_by: string;
  submitted_name: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  version: number;
  deleted_at: string | null;
};
export type BudgetEvent = {
  id: number;
  expense_id: string | null;
  fund_id: string | null;
  season_id: string | null;
  actor_id: string;
  actor_name: string;
  action: string;
  note: string;
  delta_cents: number;
  balance_after: number | null;
  details: Record<string, unknown>;
  created_at: string;
};
export type ExpectedIncome = {
  id: string;
  season_id: string;
  name: string;
  category: string;
  expected_cents: number;
  received_cents: number;
  due_on: string | null;
  canceled: boolean;
  version: number;
};
export type IncomeReceipt = {
  id: string;
  income_id: string;
  fund_id: string;
  amount_cents: number;
  included_in_balance: boolean;
  actor_name: string;
  created_at: string;
};
export type BudgetData = {
  income?: ExpectedIncome[];
  incomeReceipts?: IncomeReceipt[];
  incomeReady?: boolean;
  funds: Fund[];
  seasons: Season[];
  allocations: Allocation[];
  plannedExpenses: PlannedExpense[];
  expenses: Expense[];
  events: BudgetEvent[];
  receipts: { expense_id: string; filename: string }[];
};
export type BudgetState = { error?: string; success?: string };
