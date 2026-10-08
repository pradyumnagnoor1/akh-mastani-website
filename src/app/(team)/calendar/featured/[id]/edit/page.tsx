import { requireAdmin } from "@/features/identity/session";
import { featuredData } from "@/features/featured-events/queries";
import { FeaturedEventForm } from "@/components/featured-event-form";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params,
    { events } = await featuredData();
  const event = events.find((e) => e.id === id && !e.deleted_at);
  if (!event) notFound();
  return (
    <>
      <div className="page-heading">
        <h1>Edit featured event</h1>
      </div>
      <FeaturedEventForm key={`${id}-${event.version}`} id={id} event={event} />
    </>
  );
}
