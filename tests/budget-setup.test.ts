import { expect, it } from "vitest";
import {
  parseBudgetSetup,
  parseFundBalances,
  parsePlannedExpenses,
} from "../src/features/budget/setup";
import { CATEGORIES } from "../src/features/budget/types";

const base = () => CATEGORIES.map((category) => ({ category, amount: "0.00" }));

it("sums formatted category amounts and accepts a valid custom category", () => {
  const entries = base();
  entries[0].amount = "1,250.50";
  const result = parseBudgetSetup(" 2026–2027  season ", [
    ...entries,
    { category: "Team meals", amount: "249.50" },
  ]);
  expect(result.name).toBe("2026–2027 season");
  expect(result.totalCents).toBe(150000);
  expect(result.allocations.at(-1)).toEqual({
    category: "Team meals",
    limit_cents: 24950,
  });
});

it("validates known expenses against category allocations and eligible funds", () => {
  const allocation = parseBudgetSetup(
    "Season",
    base().map((row) =>
      row.category === "Competition" ? { ...row, amount: "1,000" } : row,
    ),
  ).allocations;
  const plan = {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Competition fee",
    category: "Competition",
    amount: "750.00",
    request_deduction: true,
    fund_id: "venmo",
    included_in_balance: false,
  };
  expect(parsePlannedExpenses([plan], allocation)).toEqual([
    {
      id: plan.id,
      name: plan.name,
      category: plan.category,
      amount_cents: 75000,
      request_deduction: true,
      fund_id: "venmo",
      included_in_balance: false,
    },
  ]);
  expect(() =>
    parsePlannedExpenses([{ ...plan, amount: "1,001" }], allocation),
  ).toThrow(/exceed its allocation/);
  expect(() =>
    parsePlannedExpenses([{ ...plan, fund_id: "goodbull" }], allocation),
  ).toThrow(/eligible fund/);
  expect(() => parsePlannedExpenses([plan, plan], allocation)).toThrow(
    /appears more than once/,
  );
});

it("rejects invalid names, duplicate categories, nonnumeric amounts and oversized totals", () => {
  expect(() => parseBudgetSetup("<budget>", base())).toThrow(/Name the budget/);
  expect(() =>
    parseBudgetSetup("Season", [
      ...base(),
      { category: "production", amount: "1" },
    ]),
  ).toThrow(/appears more than once/);
  expect(() =>
    parseBudgetSetup("Season", [
      ...base(),
      { category: "Team 🪩", amount: "1" },
    ]),
  ).toThrow(/Category names/);
  expect(() =>
    parseBudgetSetup(
      "Season",
      base().map((entry, index) =>
        index ? entry : { ...entry, amount: "1x" },
      ),
    ),
  ).toThrow(/dollar amount/);
  expect(() => parseBudgetSetup("Season", base())).toThrow(/above \$0/);
  expect(() =>
    parseBudgetSetup(
      "Season",
      base().map((entry) => ({ ...entry, amount: "200,000.00" })),
    ),
  ).toThrow(/cannot exceed/);
});

it("accepts optional formatted fund snapshots and rejects duplicate or invalid funds", () => {
  const funds = [
    { fund_id: "venmo", amount: "1,250.50", version: 1 },
    { fund_id: "goodbull", amount: "", version: 2 },
    { fund_id: "sofc", amount: "0.00", version: 1 },
  ];
  expect(parseFundBalances(funds)).toEqual([
    { fund_id: "venmo", amount_cents: 125050, version: 1 },
    { fund_id: "goodbull", amount_cents: null, version: 2 },
    { fund_id: "sofc", amount_cents: 0, version: 1 },
  ]);
  expect(() => parseFundBalances([funds[0], funds[0], funds[2]])).toThrow(
    /Check the fund/,
  );
  expect(() =>
    parseFundBalances([{ ...funds[0], amount: "1x" }, funds[1], funds[2]]),
  ).toThrow(/dollar amount/);
});
