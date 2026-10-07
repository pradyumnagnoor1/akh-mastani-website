import { randomUUID } from "node:crypto";
import { communicationEditorData } from "@/features/communication/queries";
import { PaymentForm } from "@/components/payment-forms";
export default async function Page() {
  const data = await communicationEditorData();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">ADMIN / PAYMENTS</p>
        <h1>
          Issue charges<span className="accent">.</span>
        </h1>
        <p className="muted">
          Set the amount and preview exactly who will receive a charge.
        </p>
      </div>
      <PaymentForm id={randomUUID()} {...data} />
    </>
  );
}
