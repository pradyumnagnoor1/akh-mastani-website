import { budgetData } from "@/features/budget/queries";
export async function GET() {
  const { data } = await budgetData();
  const cell = (value: unknown) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows: unknown[][] = [
    [
      "Season",
      "Category",
      "Expense",
      "Funding source",
      "Total USD",
      "Verified paid USD",
      "Reported paid USD",
      "Refunded USD",
      "Status",
      "Submitter",
      "Reviewer",
      "Due date",
      "Notes",
    ],
  ];
  for (const e of data.expenses)
    rows.push([
      data.seasons.find((s) => s.id === e.season_id)?.name,
      e.category,
      e.title,
      data.funds.find((f) => f.id === e.fund_id)?.name,
      e.total_cents / 100,
      e.paid_cents / 100,
      e.reported_cents / 100,
      e.refunded_cents / 100,
      e.status,
      e.submitted_name,
      e.reviewed_name,
      e.due_on,
      e.notes,
    ]);
  return new Response(rows.map((r) => r.map(cell).join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="team-budget.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
