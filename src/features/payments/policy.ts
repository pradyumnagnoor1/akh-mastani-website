export function parseAmount(value: string): number {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a USD amount with at most two decimal places.");
  const [dollars, cents = ""] = value.trim().split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (amount < 1 || amount > 1000000)
    throw new Error("Use an amount from $0.01 to $10,000.00.");
  return amount;
}
