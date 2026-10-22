import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { paymentData } from "@/features/payments/queries";
import {
  formatMoney,
  paymentStatus,
  type PaymentAudit,
} from "@/features/payments/types";
import { PaymentAction, DeletePaymentForm } from "@/components/payment-forms";
import { collectPages } from "@/features/communication/pagination";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, supabase, charges } = await paymentData();
  const charge = charges.find((c) => c.id === id);
  if (!charge || charge.status === "deleted") notFound();
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
      <div className="page-heading">
        <Link className="back-link" href="/payments">
          ← Payments
        </Link>
        <p className="eyebrow">Payment · {name}</p>
        <h1>{charge.reason}</h1>
        <span className={`badge status-${charge.status}`}>
          {paymentStatus[charge.status]}
        </span>
      </div>
      <section className="panel stack payment-balance">
        <h2 className="metric">{formatMoney(charge.amount_cents)}</h2>
        <p className="muted">
          {charge.due_on
            ? `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${charge.due_on}T12:00:00Z`))}`
            : "No due date"}
        </p>
        <hr />
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
      {member.is_admin &&
        (charge.status === "unpaid" || charge.status === "reported") && (
          <div className="actions">
            <Link
              href={`/payments/${charge.id}/edit`}
              className="button secondary"
            >
              Edit charge
            </Link>
          </div>
        )}
      <div className="payment-actions">
        {charge.member_id === member.id && charge.status === "unpaid" && (
          <PaymentAction
            key={`report-${charge.id}`}
            charge={charge}
            operation="report"
          />
        )}
        {member.is_admin && charge.status === "reported" && (
          <>
            <PaymentAction
              key={`verify-${charge.id}`}
              charge={charge}
              operation="verify"
            />
            <PaymentAction
              key={`reject-${charge.id}`}
              charge={charge}
              operation="reject"
            />
          </>
        )}
        {member.is_admin &&
          (charge.status === "unpaid" || charge.status === "reported") && (
            <PaymentAction
              key={`waive-${charge.id}`}
              charge={charge}
              operation="waive"
            />
          )}
      </div>
      {member.is_admin && (
        <DeletePaymentForm key={`delete-${charge.id}`} charge={charge} />
      )}
      <section className="panel stack">
        <h2>Payment activity</h2>
        {history.map((event) => (
          <div key={event.id} className="activity-row">
            <strong>
              {{
                issued: "Charge issued",
                report: "Payment reported",
                verify: "Payment verified",
                reject: "Report rejected",
                waive: "Charge waived",
                update: "Charge updated",
                delete: "Charge deleted",
              }[event.action] ?? event.action}
            </strong>
            <p className="muted small">
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Chicago",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              }).format(new Date(event.created_at))}
            </p>
            {event.action === "update" && (
              <p className="muted small">
                {formatMoney(
                  Number(
                    (
                      event.details.before as
                        { amount_cents?: number } | undefined
                    )?.amount_cents ?? 0,
                  ),
                )}{" "}
                →{" "}
                {formatMoney(
                  Number(
                    (
                      event.details.after as
                        { amount_cents?: number } | undefined
                    )?.amount_cents ?? 0,
                  ),
                )}
              </p>
            )}
            {event.note && <p className="preserve-lines">{event.note}</p>}
          </div>
        ))}
      </section>
    </>
  );
}
