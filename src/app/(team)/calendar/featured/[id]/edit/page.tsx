/* eslint-disable react-hooks/purity -- Server components capture request time for expiration timers. */
import { Expires } from "@/components/expires";
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
    <Expires at={event.expires_at} serverNow={Date.now()} detail>
      <div className="page-heading">
        <h1>Edit featured event</h1>
      </div>
      <FeaturedEventForm key={`${id}-${event.version}`} id={id} event={event} />
    </Expires>
  );
}
