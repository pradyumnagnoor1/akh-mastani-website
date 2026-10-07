import { requireAdmin } from "@/features/identity/session";
import { EXPORT_TABLES, readExport } from "@/features/operations/export";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  const { supabase } = await requireAdmin();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const result = await readExport((table, from, to) => {
      const spec = EXPORT_TABLES[table];
      let query = supabase.from(table).select(spec.columns);
      for (const column of spec.order) query = query.order(column);
      return query.range(from, to);
    });
    return Response.json(result, {
      headers: {
        ...headers,
        "Content-Disposition":
          'attachment; filename="akh-mastani-records.json"',
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Export unavailable or too large. Retry or use the owner backup procedure.",
      },
      { status: 503, headers },
    );
  }
}
