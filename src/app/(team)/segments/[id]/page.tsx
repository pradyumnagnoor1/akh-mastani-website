import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Download, ArrowUpRight, Pencil, Users } from "lucide-react";
import { segmentData } from "@/features/segments/queries";
import { RemoveSegmentForm } from "@/components/segment-form";
export default async function SegmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { segments, assignments, member, supabase } = await segmentData();
  const segment = segments.find((s) => s.id === id);
  if (!segment) notFound();
  const { data: people, error } = await supabase
    .from("members")
    .select("id,display_name,is_admin")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error("Unable to load dancers.");
  const assignedIds = new Set(
    assignments.filter((a) => a.segment_id === id).map((a) => a.member_id),
  );
  const dancers = people.filter((p) => assignedIds.has(p.id));
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <Link href="/segments" className="back-link">
            ← Set design
          </Link>
          <p className="eyebrow">
            {segment.archived_at
              ? "ARCHIVED SEGMENT"
              : "THE FORMATIONS & THE PEOPLE"}
          </p>
          <h1>
            {segment.name}
            <span className="accent">.</span>
          </h1>
          <p className="muted">
            {dancers.length} active dancers · Formation PDF
          </p>
        </div>
        {member.is_admin && !segment.archived_at && (
          <Link className="button secondary" href={`/segments/${id}/edit`}>
            <Pencil size={16} />
            Edit segment
          </Link>
        )}
      </div>
      {segment.archived_at && (
        <p className="notice">
          This segment has been removed from team views. You’re viewing its
          archived record as an admin.
        </p>
      )}
      <div className="segment-detail-grid">
        <section className="panel document-panel">
          <div className="section-toolbar">
            <h2>
              <FileText size={20} />
              Formations
            </h2>
            <a
              className="button secondary small"
              href={`/segments/${id}/document?download=1`}
            >
              <Download size={15} />
              Download
            </a>
          </div>
          <p className="muted small document-name">{segment.document_label}</p>
          <iframe
            className="pdf-viewer"
            src={`/segments/${id}/document`}
            title={`Formation PDF for ${segment.name}`}
            loading="lazy"
          />
          <p className="document-fallback">
            Can’t see the document?{" "}
            <a
              href={`/segments/${id}/document`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PDF in a new tab <ArrowUpRight size={14} />
            </a>
          </p>
        </section>
        <section className="panel lineup-panel">
          <div className="panel-title">
            <Users size={20} />
            <h2>The lineup</h2>
            <span className="count">{dancers.length}</span>
          </div>
          {dancers.length ? (
            dancers.map((dancer) => (
              <div className="lineup-person" key={dancer.id}>
                <span>
                  {dancer.display_name}
                  {dancer.id === member.id && (
                    <small className="you">YOU</small>
                  )}
                </span>
                {dancer.is_admin && <small className="badge">Admin</small>}
              </div>
            ))
          ) : (
            <p className="empty">No active dancers assigned yet.</p>
          )}
        </section>
      </div>
      {member.is_admin && !segment.archived_at && (
        <RemoveSegmentForm segment={segment} />
      )}
    </>
  );
}
