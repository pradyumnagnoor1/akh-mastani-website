import Link from "next/link";
import { notFound } from "next/navigation";
import { paymentData } from "@/features/payments/queries";
import {
  formatMoney,
  paymentStatus,
  type PaymentAudit,
} from "@/features/payments/types";
import { PaymentAction } from "@/components/payment-forms";
import { collectPages } from "@/features/communication/pagination";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, supabase, charges } = await paymentData();
  const charge = charges.find((c) => c.id === id);
  if (!charge) notFound();
  const history = (await collectPages((from, to) =>
    supabase
      .from("payment_audit")
      .select("*")
      .eq("charge_id", id)
      .order("id")
      .range(from, to),
  )) as PaymentAudit[];
  let name = member.display_name;
  if (member.is_admin && charge.member_id !== member.id) {
    const { data, error } = await supabase
      .from("members")
      .select("display_name,email")
      .eq("id", charge.member_id)
      .maybeSingle();
    if (error) throw new Error("Unable to load dancer.");
    name = data?.display_name ?? data?.email ?? "Dancer";
  }
  return (
    <>
      <Link className="back-link" href="/payments">
        ← Payments
      </Link>
      <div className="page-heading">
        <p className="eyebrow">PAYMENT / {name}</p>
        <h1>{charge.reason}</h1>
        <p className="badge">{paymentStatus[charge.status]}</p>
      </div>
      <section className="panel stack">
        <h2>{formatMoney(charge.amount_cents)}</h2>
        <p className="muted">
          {charge.due_on ? `Due ${charge.due_on}` : "No due date"}
        </p>
        <h3>Payment instructions</h3>
        <p className="preserve-lines">{charge.instructions}</p>
        {charge.report_note && (
          <p className="preserve-lines">Payment report: {charge.report_note}</p>
        )}
        {charge.review_note && (
          <p className="notice preserve-lines">
            Admin explanation: {charge.review_note}
          </p>
        )}
        {charge.status === "reported" && (
          <p className="notice">
            Awaiting admin verification. This amount is still outstanding.
          </p>
        )}
      </section>
      <div className="payment-actions">
        {charge.member_id === member.id && charge.status === "unpaid" && (
          <PaymentAction
            key={`report-${charge.version}`}
            charge={charge}
            operation="report"
          />
        )}
        {member.is_admin && charge.status === "reported" && (
          <>
            <PaymentAction
              key={`verify-${charge.version}`}
              charge={charge}
              operation="verify"
            />
            <PaymentAction
              key={`reject-${charge.version}`}
              charge={charge}
              operation="reject"
            />
          </>
        )}
        {member.is_admin &&
          (charge.status === "unpaid" || charge.status === "reported") && (
            <PaymentAction
              key={`waive-${charge.version}`}
              charge={charge}
              operation="waive"
            />
          )}
      </div>
      <section className="panel stack">
        <h2>Payment activity</h2>
        {history.map((event) => (
          <div key={event.id}>
            <strong>
              {{
                issued: "Charge issued",
                report: "Payment reported",
                verify: "Payment verified",
                reject: "Report rejected",
                waive: "Charge waived",
              }[event.action] ?? event.action}
            </strong>
            <p className="muted small">
              {new Date(event.created_at)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC
            </p>
            {event.note && <p className="preserve-lines">{event.note}</p>}
          </div>
        ))}
      </section>
    </>
  );
}
