import { requireAdmin } from "@/features/identity/session";
import { FeaturedEventForm } from "@/components/featured-event-form";
export default async function Page() {
  await requireAdmin();
  return (
    <>
      <div className="page-heading">
        <h1>New featured event</h1>
        <p className="muted">
          Shown to the team alongside the Google schedule.
        </p>
      </div>
      <FeaturedEventForm id={crypto.randomUUID()} />
    </>
  );
}
