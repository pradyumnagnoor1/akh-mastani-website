import { randomUUID } from "node:crypto";
import { communicationEditorData } from "@/features/communication/queries";
import { PaymentForm } from "@/components/payment-forms";
export default async function Page() {
  const data = await communicationEditorData();
  return (
    <>
      <div className="page-heading">
        <h1>Issue charges</h1>
        <p className="muted">
          Set the amount and preview exactly who will receive a charge.
        </p>
      </div>
      <PaymentForm id={randomUUID()} {...data} />
    </>
  );
}
