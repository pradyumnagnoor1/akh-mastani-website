import Link from "next/link";
import { notFound } from "next/navigation";
import { segmentData } from "@/features/segments/queries";
import { communicationData } from "@/features/communication/queries";
import { paymentData } from "@/features/payments/queries";
import { formatMoney } from "@/features/payments/types";
import { UUID } from "@/features/segments/policy";
export default async function MemberDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { member, supabase, segments, assignments } = await segmentData();
  const { data: person, error } = await supabase
    .from("members")
    .select("id,email,display_name,status,is_admin")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load dancer.");
  if (!person) notFound();
  const mine = segments.filter(
    (s) =>
      !s.archived_at &&
      assignments.some((a) => a.segment_id === s.id && a.member_id === id),
  );
  const privateAllowed = member.is_admin || member.id === id;
  const communication = privateAllowed ? await communicationData() : null;
  const payments = privateAllowed ? await paymentData() : null;
  const posts =
    communication?.posts.filter((p) =>
      communication.recipients.some(
        (r) => r.post_id === p.id && r.member_id === id,
      ),
    ) ?? [];
  const charges = payments?.charges.filter((c) => c.member_id === id) ?? [];
  return (
    <>
      <Link href="/roster" className="text-button">
        ← Team roster
      </Link>
      <div className="page-heading">
        <h1>{person.display_name ?? "Name pending"}</h1>
        <p className="muted">{person.email}</p>
        <span className="badge">
          Dancer{person.is_admin ? " · Admin access" : ""} · {person.status}
        </span>
      </div>
      <section className="panel my-segments">
        <h2>Segments</h2>
        {mine.length ? (
          mine.map((s) => (
            <Link
              key={s.id}
              href={`/segments/${s.id}`}
              className="my-segment-row"
            >
              {s.name} →
            </Link>
          ))
        ) : (
          <p className="muted">No active segment assignments.</p>
        )}
      </section>
      {privateAllowed && (
        <>
          <section className="panel my-segments">
            <h2>Assigned announcements & to-dos</h2>
            {posts.length ? (
              posts.map((p) => {
                const completed =
                  p.completion_mode === "shared"
                    ? p.completed_at
                    : communication!.recipients.find(
                        (r) => r.post_id === p.id && r.member_id === id,
                      )?.completed_at;
                return (
                  <Link
                    key={p.id}
                    href={`/${p.kind === "task" ? "todos" : "announcements"}/${p.id}`}
                    className="my-segment-row"
                  >
                    <strong>{p.title}</strong>
                    <span className="badge">
                      {completed
                        ? p.kind === "task"
                          ? "Done"
                          : "Read"
                        : "Pending"}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="muted">No assigned items.</p>
            )}
          </section>
          <section className="panel my-segments">
            <h2>Payments</h2>
            <p className="muted">
              Outstanding:{" "}
              {formatMoney(
                charges
                  .filter(
                    (c) => c.status === "unpaid" || c.status === "reported",
                  )
                  .reduce((sum, c) => sum + c.amount_cents, 0),
              )}
            </p>
            {charges.length ? (
              charges.map((c) => (
                <Link
                  key={c.id}
                  href={`/payments/${c.id}`}
                  className="my-segment-row"
                >
                  <strong>
                    {c.reason} · {formatMoney(c.amount_cents)}
                  </strong>
                  <span className="badge">
                    {c.status === "reported"
                      ? "Awaiting verification"
                      : c.status}
                  </span>
                </Link>
              ))
            ) : (
              <p className="muted">No payment records.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
