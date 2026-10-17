import { requireAdmin } from "@/features/identity/session";
import { customPracticeData } from "@/features/custom-practices/queries";
import { notFound } from "next/navigation";
import { CustomPracticeForm } from "@/components/custom-practice-form";
import Link from "@/components/app-link";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { events } = await customPracticeData();
  const event = events.find((e) => e.id === `custom:${id}`);
  if (!event) notFound();
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href="/calendar">
          ← Practice calendar
        </Link>
        <h1>Edit custom practice</h1>
        <p className="muted">
          Changes update the calendar and shared practice reminder.
        </p>
      </div>
      <CustomPracticeForm event={event} />
    </>
  );
}
