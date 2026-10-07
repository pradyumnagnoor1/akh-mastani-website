// Deliberate columns: never export auth identities, OAuth credentials or Storage bytes.
export const EXPORT_TABLES = {
  members: { columns: "id,email,display_name,status,is_admin", order: ["id"] },
  segments: {
    columns:
      "id,name,document_path,document_label,version,archived_at,updated_at",
    order: ["id"],
  },
  segment_members: {
    columns: "segment_id,member_id",
    order: ["segment_id", "member_id"],
  },
  communication_posts: {
    columns:
      "id,title,body,kind,completion_mode,audience_type,audience_label,due_on,version,archived_at,created_at,created_by,completed_at,completed_by",
    order: ["id"],
  },
  communication_recipients: {
    columns: "post_id,member_id,completed_at",
    order: ["post_id", "member_id"],
  },
  communication_groups: {
    columns: "id,name,version,archived_at",
    order: ["id"],
  },
  communication_group_members: {
    columns: "group_id,member_id",
    order: ["group_id", "member_id"],
  },
  payment_charges: {
    columns:
      "id,batch_id,member_id,amount_cents,reason,instructions,due_on,status,version,reported_at,report_note,review_note,verified_at,created_at,created_by",
    order: ["id"],
  },
  payment_audit: {
    columns: "id,charge_id,actor_id,action,note,details,created_at",
    order: ["id"],
  },
} as const;
export const EXPORT_LIMIT_BYTES = 3_000_000;
export async function readExport(
  read: (
    table: keyof typeof EXPORT_TABLES,
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const tables: Record<string, unknown[]> = {};
  let bytes = 0;
  for (const table of Object.keys(
    EXPORT_TABLES,
  ) as (keyof typeof EXPORT_TABLES)[]) {
    tables[table] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await read(table, from, from + 499);
      if (error || !data) throw new Error("Export unavailable. Try again.");
      bytes += new TextEncoder().encode(JSON.stringify(data)).length;
      if (bytes > EXPORT_LIMIT_BYTES || from + data.length > 20_000)
        throw new Error("Export too large. Use the owner backup procedure.");
      tables[table].push(...data);
      if (data.length < 500) break;
    }
  }
  return {
    format: "akh-mastani-operational-v1",
    generated_at: new Date().toISOString(),
    note: "Operational records only; not a transactionally consistent database backup. Formation files and Auth accounts are excluded.",
    tables,
  };
}
