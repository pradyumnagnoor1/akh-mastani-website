import { cents, eligibleFund } from "./policy";
import { CATEGORIES } from "./types";

export type AllocationEntry = { category: string; amount: string };
export type PlannedEntry = {
  id: string;
  name: string;
  category: string;
  amount: string;
  request_deduction: boolean;
  fund_id: string;
  included_in_balance: boolean;
};
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} &/'().,\-–]*$/u;
export const tidyName = (value: string) => value.trim().replace(/\s+/g, " ");
export function validBudgetName(
  value: string,
  kind: "budget" | "category" | "planned",
) {
  const name = tidyName(value);
  const max = kind === "category" ? 50 : 80;
  if (name.length < 2 || name.length > max || !NAME.test(name))
    throw new Error(
      kind === "category"
        ? "Category names need 2–50 letters, numbers, spaces or common punctuation."
        : kind === "planned"
          ? "Planned expense names need 2–80 letters, numbers, spaces or common punctuation."
          : "Name the budget using 2–80 letters, numbers, spaces or common punctuation.",
    );
  return name;
}
export function parsePlannedExpenses(
  entries: PlannedEntry[],
  allocations: { category: string; limit_cents: number }[],
) {
  if (!Array.isArray(entries) || entries.length > 100)
    throw new Error("Add at most 100 planned expenses.");
  const byCategory = new Map(
    allocations.map((allocation) => [
      allocation.category,
      allocation.limit_cents,
    ]),
  );
  const totals = new Map<string, number>();
  const names = new Set<string>();
  const ids = new Set<string>();
  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        entry.id,
      ) ||
      typeof entry.name !== "string" ||
      typeof entry.category !== "string" ||
      typeof entry.amount !== "string" ||
      typeof entry.request_deduction !== "boolean" ||
      typeof entry.fund_id !== "string" ||
      typeof entry.included_in_balance !== "boolean"
    )
      throw new Error("Check the planned expense details.");
    if (ids.has(entry.id))
      throw new Error("A planned expense appears more than once.");
    ids.add(entry.id);
    const name = validBudgetName(entry.name, "planned");
    if (!byCategory.has(entry.category))
      throw new Error(`Choose a category for “${name}”.`);
    const key = `${entry.category.toLocaleLowerCase("en-US")}:${name.toLocaleLowerCase("en-US")}`;
    if (names.has(key))
      throw new Error(
        `The planned expense “${name}” appears more than once in ${entry.category}.`,
      );
    names.add(key);
    const amount_cents = cents(entry.amount.replaceAll(",", ""));
    if (amount_cents <= 0)
      throw new Error(`Enter an amount above $0 for “${name}”.`);
    const sum = (totals.get(entry.category) ?? 0) + amount_cents;
    if (sum > byCategory.get(entry.category)!)
      throw new Error(
        `Planned expenses in ${entry.category} exceed its allocation.`,
      );
    totals.set(entry.category, sum);
    if (
      entry.request_deduction &&
      (!["venmo", "goodbull", "sofc"].includes(entry.fund_id) ||
        !eligibleFund(entry.fund_id, entry.category))
    )
      throw new Error(`Choose an eligible fund for “${name}”.`);
    return {
      id: entry.id,
      name,
      category: entry.category,
      amount_cents,
      request_deduction: entry.request_deduction,
      fund_id: entry.request_deduction ? entry.fund_id : null,
      included_in_balance: entry.request_deduction && entry.included_in_balance,
    };
  });
}
export function parseBudgetSetup(
  nameInput: string,
  entries: AllocationEntry[],
) {
  const name = validBudgetName(nameInput, "budget");
  if (
    !Array.isArray(entries) ||
    entries.length < CATEGORIES.length ||
    entries.length > 40
  )
    throw new Error(
      "Include all standard categories and at most 31 custom categories.",
    );
  const seen = new Set<string>();
  let totalCents = 0;
  const allocations = entries.map((entry) => {
    if (
      !entry ||
      typeof entry.category !== "string" ||
      typeof entry.amount !== "string"
    )
      throw new Error("Check the category names and amounts.");
    const category = validBudgetName(entry.category, "category");
    const key = category.toLocaleLowerCase("en-US");
    if (seen.has(key))
      throw new Error(`The category “${category}” appears more than once.`);
    seen.add(key);
    const limit_cents = cents(entry.amount.replaceAll(",", "") || "0");
    totalCents += limit_cents;
    return { category, limit_cents };
  });
  if (
    CATEGORIES.some(
      (category) => !seen.has(category.toLocaleLowerCase("en-US")),
    )
  )
    throw new Error("Keep all standard categories in the budget.");
  if (totalCents <= 0)
    throw new Error("Allocate an amount above $0 to at least one category.");
  if (totalCents > 100000000)
    throw new Error("The total budget cannot exceed $1,000,000.");
  return { name, allocations, totalCents };
}
