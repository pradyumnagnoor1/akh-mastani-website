import { it, expect } from "vitest";
import { parseAmount } from "../src/features/payments/policy";
it("parses exact USD cents without floating arithmetic", () => {
  expect(parseAmount("0.29")).toBe(29);
  expect(parseAmount("10000.00")).toBe(1000000);
  expect(parseAmount("12.5")).toBe(1250);
});
it("rejects ambiguous, excessive and nonpositive amounts", () => {
  for (const value of [
    "0",
    "-2",
    "1e2",
    "1.001",
    "10000.01",
    "NaN",
    "Infinity",
    ".5",
    "1,000",
  ])
    expect(() => parseAmount(value)).toThrow();
});
