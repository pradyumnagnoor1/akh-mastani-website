export type Charge = {
  id: string;
  batch_id: string;
  member_id: string;
  amount_cents: number;
  reason: string;
  instructions: string;
  due_on: string | null;
  status: "unpaid" | "reported" | "verified" | "waived" | "deleted";
  version: number;
  reported_at: string | null;
  report_note: string | null;
  review_note: string | null;
  verified_at: string | null;
  created_at: string;
  created_by: string | null;
};
export type PaymentAudit = {
  id: number;
  charge_id: string;
  actor_id: string;
  action: string;
  note: string | null;
  created_at: string;
  details: Record<string, unknown>;
};
export type FormState = { error: string | null; success?: string };
export function formatMoney(cents: number) {
  return `$${Math.trunc(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}
export const paymentStatus = {
  unpaid: "Unpaid",
  reported: "Awaiting verification",
  verified: "Verified",
  waived: "Waived",
  deleted: "Deleted",
};
export const outstanding = (charge: Charge) =>
  charge.status === "unpaid" || charge.status === "reported";
