import Link from "next/link";
import { requireAdmin } from "@/features/identity/session";
import { paymentData } from "@/features/payments/queries";
import { communicationData } from "@/features/communication/queries";
export async function AdminSummary() {
  const { supabase } = await requireAdmin();
  const [{ charges }, { posts, recipients }, { count, error }] =
    await Promise.all([
      paymentData(),
      communicationData(),
      supabase
        .from("members")
        .select("id", { head: true, count: "exact" })
        .eq("status", "pending"),
    ]);
  if (error) throw new Error("Unable to load admin summary.");
  const reports = charges.filter((c) => c.status === "reported").length;
  const open = posts.filter(
    (p) =>
      p.kind === "task" &&
      !p.archived_at &&
      (p.completion_mode === "shared"
        ? !p.completed_at
        : recipients.some((r) => r.post_id === p.id && !r.completed_at)),
  ).length;
  return (
    <section className="panel my-segments">
      <h2>Admin overview</h2>
      <div className="my-segment-row">
        <Link href="/admin">{count ?? 0} membership requests →</Link>
        <Link href="/payments?view=reported">{reports} payment reports →</Link>
        <Link href="/todos?view=all">{open} open team to-dos →</Link>
      </div>
    </section>
  );
}
