import Link from "@/components/app-link";
import { collectPages } from "@/features/communication/pagination";
import { paymentData } from "@/features/payments/queries";
import {
  formatMoney,
  outstanding,
  paymentStatus,
  type Charge,
} from "@/features/payments/types";
const formatDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const { member, supabase, charges } = await paymentData();
  const tab =
    member.is_admin && (view === "all" || view === "reported") ? view : "mine";
  const items = charges.filter((c) =>
    tab === "mine"
      ? c.member_id === member.id
      : tab === "reported"
        ? c.status === "reported"
        : true,
  );
  const names = new Map<string, string>();
  if (tab !== "mine") {
    const data = (await collectPages((from, to) =>
      supabase
        .from("members")
        .select("id,display_name,email")
        .order("id")
        .range(from, to),
    )) as { id: string; display_name: string | null; email: string }[];
    for (const p of data) names.set(p.id, p.display_name ?? p.email);
  }
  function rows(list: Charge[]) {
    return list.length ? (
      <div className="payment-list">
        {list.map((c) => (
          <Link
            key={c.id}
            href={`/payments/${c.id}`}
            className="panel payment-row"
          >
            <div>
              <h3>{c.reason}</h3>
              {tab !== "mine" && (
                <p className="muted">{names.get(c.member_id) ?? "Dancer"}</p>
              )}
              <p className="muted small">
                {c.due_on ? `Due ${formatDay(c.due_on)}` : "No due date"}
              </p>
            </div>
            <div>
              <strong>{formatMoney(c.amount_cents)}</strong>
              <span className={`badge status-${c.status}`}>
                {paymentStatus[c.status]}
              </span>
            </div>
          </Link>
        ))}
      </div>
    ) : (
      <p className="panel muted">No payments here.</p>
    );
  }
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Payments</h1>
          <p className="muted">
            Report your payments, then track admin verification.
          </p>
        </div>
        {member.is_admin && (
          <Link className="button primary" href="/payments/new">
            Issue charges
          </Link>
        )}
      </div>
      {member.is_admin && (
        <nav className="view-tabs" aria-label="Payment views">
          <Link className={tab === "mine" ? "active" : ""} href="/payments">
            For me
          </Link>
          <Link
            className={tab === "all" ? "active" : ""}
            href="/payments?view=all"
          >
            All team
          </Link>
          <Link
            className={tab === "reported" ? "active" : ""}
            href="/payments?view=reported"
          >
            Awaiting verification
          </Link>
        </nav>
      )}
      <section className="panel payment-balance">
        <p className="eyebrow">
          {tab === "mine" ? "Your" : "Selected"} outstanding balance
        </p>
        <h2 className="metric">
          {formatMoney(
            items
              .filter(outstanding)
              .reduce((sum, c) => sum + c.amount_cents, 0),
          )}
        </h2>
        <p className="muted small">
          Reported payments remain outstanding until verified. This site does
          not transfer money.
        </p>
      </section>
      <section className="payment-section">
        <h2>{tab === "reported" ? "Awaiting verification" : "Outstanding"}</h2>
        {rows(items.filter(outstanding))}
      </section>
      {tab !== "reported" && (
        <section className="payment-section">
          <h2>Payment history</h2>
          {rows(items.filter((c) => !outstanding(c)))}
        </section>
      )}
    </>
  );
}
