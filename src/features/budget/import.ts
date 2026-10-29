import { cents, eligibleFund } from "./policy";
import { CATEGORIES } from "./types";
export type ImportRow = {
  id: string;
  title: string;
  category: string;
  fund_id: string;
  total: string;
  paid: string;
  notes: string;
};
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("The CSV has an unclosed quote.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function oldSheetRows(text: string): ImportRow[] {
  const rows = parseCsv(text);
  const h = rows[0] ?? [];
  if (
    h[2] !== "Type" ||
    h[3] !== "Description" ||
    h[4] !== "Amount Due" ||
    h[5] !== "Amount Paid"
  )
    throw new Error(
      "This import expects the previous AKH finance sheet layout.",
    );
  return rows
    .slice(1)
    .filter((r) => r[2]?.trim() && r[3]?.trim())
    .map((r) => ({
      id: crypto.randomUUID(),
      title: r[3].trim(),
      category: r[2].trim(),
      fund_id: r[7]?.trim() === "Venmo" ? "venmo" : "",
      total: String(
        (cents(r[4]?.replace(/[$,]/g, "") || "0") +
          cents(r[5]?.replace(/[$,]/g, "") || "0")) /
          100,
      ),
      paid: String(cents(r[5]?.replace(/[$,]/g, "") || "0") / 100),
      notes: r[6]?.trim() ?? "",
    }));
}
export function validateImportRows(
  rows: ImportRow[],
  allowedCategories: readonly string[] = CATEGORIES,
) {
  if (!rows.length || rows.length > 100)
    throw new Error("Choose 1–100 expense rows.");
  for (const [i, r] of rows.entries()) {
    const total = cents(r.total),
      paid = cents(r.paid);
    if (
      !r.title ||
      r.title.length > 160 ||
      !allowedCategories.includes(r.category) ||
      !["venmo", "goodbull", "sofc"].includes(r.fund_id) ||
      !eligibleFund(r.fund_id, r.category) ||
      total <= 0 ||
      paid > total
    )
      throw new Error(
        `Check row ${i + 1}: name, category, source and amounts.`,
      );
  }
}
