import { requireAdmin } from "@/features/identity/session";
import { paymentData } from "@/features/payments/queries";
import { EditPaymentForm } from "@/components/payment-forms";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params,
    { charges } = await paymentData();
  const charge = charges.find(
    (c) => c.id === id && (c.status === "unpaid" || c.status === "reported"),
  );
  if (!charge) notFound();
  return (
    <>
      <div className="page-heading">
        <h1>Edit charge</h1>
      </div>
      <EditPaymentForm key={`${id}-${charge.version}`} charge={charge} />
    </>
  );
}
