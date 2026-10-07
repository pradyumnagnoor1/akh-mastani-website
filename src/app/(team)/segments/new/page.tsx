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
        <p className="eyebrow">MAKE ROOM FOR THE NEXT MOMENT</p>
        <h1>
          A new segment<span className="accent">.</span>
        </h1>
        <p className="muted">
          Add the formations and bring your lineup together.
        </p>
      </div>
      <SegmentForm
        id={crypto.randomUUID()}
        people={data as Member[]}
        assigned={[]}
      />
    </>
  );
}
