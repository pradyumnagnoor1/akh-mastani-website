import Link from "next/link";
import { paymentData } from "@/features/payments/queries";
import { formatMoney } from "@/features/payments/types";
export async function PaymentHome() {
  const { member, charges } = await paymentData();
  const outstanding = charges.filter(
    (c) =>
      c.member_id === member.id &&
      (c.status === "unpaid" || c.status === "reported"),
  );
  const pending = outstanding.filter((c) => c.status === "reported");
  return (
    <section className="panel my-segments">
      <div className="section-toolbar">
        <h2>Your payments</h2>
        <Link href="/payments" className="text-button">
          View payments →
        </Link>
      </div>
      <strong className="metric">
        {formatMoney(outstanding.reduce((sum, c) => sum + c.amount_cents, 0))}
      </strong>
      <p className="muted">
        {outstanding.length
          ? `${outstanding.length} outstanding ${outstanding.length === 1 ? "charge" : "charges"}${pending.length ? ` · ${pending.length} awaiting verification` : ""}`
          : "No outstanding payments."}
      </p>
      {pending.length > 0 && (
        <p className="small muted">
          Reported payments stay here until an admin verifies them.
        </p>
      )}
    </section>
  );
}
