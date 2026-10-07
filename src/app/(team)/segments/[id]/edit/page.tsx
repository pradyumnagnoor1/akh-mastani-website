import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/features/identity/session";
import { segmentData } from "@/features/segments/queries";
import { SegmentForm } from "@/components/segment-form";
import type { Member } from "@/features/identity/policy";
export default async function EditSegment({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { segments, assignments, supabase } = await segmentData();
  const segment = segments.find((s) => s.id === id && !s.archived_at);
  if (!segment) notFound();
  const { data, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error("Unable to load dancers.");
  const people = data as Member[];
  const active = new Set(people.map((p) => p.id));
  const assigned = assignments
    .filter((a) => a.segment_id === id && active.has(a.member_id))
    .map((a) => a.member_id);
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href={`/segments/${id}`}>
          ← {segment.name}
        </Link>
        <p className="eyebrow">KEEP EVERYONE IN STEP</p>
        <h1>
          Edit segment<span className="accent">.</span>
        </h1>
        <p className="muted">
          Update the name, formation document, or assigned dancers.
        </p>
      </div>
      <SegmentForm
        id={id}
        segment={segment}
        people={people}
        assigned={assigned}
      />
    </>
  );
}
