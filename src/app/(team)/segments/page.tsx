import Link from "next/link";
import { FileText, ArrowUpRight, Plus, Layers, Users } from "lucide-react";
import { segmentData } from "@/features/segments/queries";
export default async function Segments({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { segments, assignments, member, supabase } = await segmentData();
  const { view } = await searchParams;
  const archived = view === "archived" && member.is_admin;
  const { data: people, error } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active");
  if (error) throw new Error("Unable to load segment dancers.");
  const activeIds = new Set(people.map((p) => p.id));
  const visible = segments.filter((s) =>
    archived ? !!s.archived_at : !s.archived_at,
  );
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Set design</h1>
          <p className="muted">Formation PDFs and dancer assignments.</p>
        </div>
        {member.is_admin && (
          <Link className="button primary" href="/segments/new">
            <Plus size={18} />
            Add segment
          </Link>
        )}
      </div>
      <div className="section-toolbar">
        <div className="view-tabs">
          <Link href="/segments" className={!archived ? "active" : ""}>
            Active segments{" "}
            <span>{segments.filter((s) => !s.archived_at).length}</span>
          </Link>
          {member.is_admin && (
            <Link
              href="/segments?view=archived"
              className={archived ? "active" : ""}
            >
              Archive
            </Link>
          )}
        </div>
        <span className="muted small">Formation documents · PDF</span>
      </div>
      {visible.length ? (
        <div className="segment-grid">
          {visible.map((segment, index) => {
            const assigned = assignments.filter(
              (a) => a.segment_id === segment.id && activeIds.has(a.member_id),
            );
            const mine = assigned.some((a) => a.member_id === member.id);
            return (
              <Link
                className="panel segment-card"
                href={`/segments/${segment.id}`}
                key={segment.id}
              >
                <div className="segment-card-top">
                  <span className="segment-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Layers size={20} />
                </div>
                <div>
                  <div className="segment-labels">
                    {mine && (
                      <span className="badge success">Your segment</span>
                    )}
                    {archived && <span className="badge">Archived</span>}
                  </div>
                  <h2>{segment.name}</h2>
                  <div className="segment-meta">
                    <span>
                      <Users size={15} />
                      {assigned.length} dancers
                    </span>
                    <span>
                      <FileText size={15} />
                      Formation PDF
                    </span>
                  </div>
                </div>
                <div className="segment-card-footer">
                  View formations & lineup <ArrowUpRight size={17} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="panel empty-state">
          <Layers size={36} />
          <h2>{archived ? "No archived segments" : "The set starts here."}</h2>
          <p className="muted">
            {archived
              ? "Removed segments will appear here for admins."
              : member.is_admin
                ? "Add a segment, its formation PDF, and assigned dancers."
                : "Your admins will add segments and formation documents here."}
          </p>
          {member.is_admin && !archived && (
            <Link className="button primary" href="/segments/new">
              Create the first segment →
            </Link>
          )}
        </section>
      )}
    </>
  );
}
