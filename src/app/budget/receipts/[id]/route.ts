import { requireBudget } from "@/features/budget/queries";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase } = await requireBudget();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return new Response("Not found", { status: 404 });
  const { data, error } = await supabase
    .from("budget_receipts")
    .select("*")
    .eq("expense_id", id)
    .maybeSingle();
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(data.content, "base64"), {
    headers: {
      "Content-Type": data.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
