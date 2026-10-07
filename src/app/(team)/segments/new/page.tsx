import Link from "next/link";
import { requireAdmin } from "@/features/identity/session";
import { SegmentForm } from "@/components/segment-form";
import type { Member } from "@/features/identity/policy";
export default async function NewSegment() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error("Unable to load dancers.");
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href="/segments">
          ← Set design
        </Link>
        <h1>A new segment</h1>
        <p className="muted">Add a formation PDF and assign dancers.</p>
      </div>
      <SegmentForm
        id={crypto.randomUUID()}
        people={data as Member[]}
        assigned={[]}
      />
    </>
  );
}
