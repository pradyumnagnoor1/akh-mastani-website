import { segmentData } from "@/features/segments/queries";
import Link from "next/link";
import type { Member } from "@/features/identity/policy";
export default async function Roster({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, member, segments, assignments } = await segmentData();
  const { q = "" } = await searchParams;
  const { data, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error("Unable to load the roster.");
  const people = (data as Member[]).filter((person) =>
    `${person.display_name} ${person.email}`
      .toLocaleLowerCase()
      .includes(q.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <h1>Roster</h1>
        <p className="muted">Members and segment assignments.</p>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <h2>
            Team roster <span className="count">{people.length}</span>
          </h2>
          <form className="search">
            <label htmlFor="search" className="sr-only">
              Search roster
            </label>
            <input
              id="search"
              name="q"
              placeholder="Search names or emails"
              defaultValue={q}
            />
            <button className="button secondary">Search</button>
          </form>
        </div>
        <div className="roster-list">
          {people.map((person) => (
            <article key={person.id} className="roster-row">
              <div>
                <h3>
                  <Link href={`/roster/${person.id}`}>
                    {person.display_name}
                  </Link>
                  {person.id === member.id && <span className="you">YOU</span>}
                </h3>
                <a className="muted small" href={`mailto:${person.email}`}>
                  {person.email}
                </a>
                <div className="roster-segments">
                  {segments
                    .filter(
                      (segment) =>
                        !segment.archived_at &&
                        assignments.some(
                          (a) =>
                            a.segment_id === segment.id &&
                            a.member_id === person.id,
                        ),
                    )
                    .map((segment) => (
                      <Link
                        key={segment.id}
                        href={`/segments/${segment.id}`}
                        className="badge segment-chip"
                      >
                        {segment.name}
                      </Link>
                    ))}
                </div>
              </div>
              <span className="badge">
                Dancer{person.is_admin ? " · Admin" : ""}
              </span>
            </article>
          ))}
        </div>
        {people.length === 0 && (
          <p className="empty">No dancers match that search.</p>
        )}
      </section>
    </>
  );
}
