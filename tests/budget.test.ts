import { expect, it } from "vitest";
import {
  cents,
  eligibleFund,
  money,
  totals,
  canManage,
  canReview,
} from "../src/features/budget/policy";
import type { Expense } from "../src/features/budget/types";
import {
  oldSheetRows,
  validateImportRows,
} from "../src/features/budget/import";
it("parses exact cents and rejects malformed amounts", () => {
  expect(cents("12.34")).toBe(1234);
  expect(cents("-12.34", true)).toBe(-1234);
  for (const x of ["1.001", "-1", "NaN", "1e2", "", "1000001"])
    expect(() => cents(x)).toThrow();
  expect(money(-1234)).toBe("-$12.34");
});
it("separates pending reservations from verified payments and refunds", () => {
  expect(
    totals([
      {
        total_cents: 10000,
        paid_cents: 3000,
        refunded_cents: 1000,
        status: "approved",
      },
      {
        total_cents: 5000,
        paid_cents: 0,
        refunded_cents: 0,
        status: "pending",
      },
    ] as Expense[]),
  ).toEqual({ paid: 2000, reserved: 12000, pending: 5000 });
});
it("restricts source and review permissions", () => {
  expect(eligibleFund("goodbull", "Hotel")).toBe(true);
  expect(eligibleFund("goodbull", "Travel")).toBe(true);
  expect(eligibleFund("goodbull", "Mix")).toBe(false);
  expect(canReview("exec")).toBe(false);
  expect(canReview("captain")).toBe(true);
  expect(canManage("captain")).toBe(false);
  expect(canManage("owner")).toBe(true);
});
it("reads partial payments from the previous sheet as a single cost and reviews source mapping", () => {
  const csv =
    'Types of Costs,Costs,Type,Description,Amount Due,Amount Paid,Notes,Payment Source\r\nProduction,,Mix,"2 Loka, Mixes",$60.00,$180.00,Pay Rest After,Venmo\r\n';
  const rows = oldSheetRows(csv);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title: "2 Loka, Mixes",
    category: "Mix",
    fund_id: "venmo",
    total: "240",
    paid: "180",
  });
  expect(() => validateImportRows(rows)).not.toThrow();
  expect(() =>
    validateImportRows([{ ...rows[0], category: "Mix", fund_id: "goodbull" }]),
  ).toThrow();
});
