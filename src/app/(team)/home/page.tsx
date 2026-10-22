import { FeaturedEvents } from "@/components/featured-events";
import { NotificationSettings } from "@/components/notification-settings";
import { AdminSummary } from "@/components/admin-summary";
import { CalendarHome } from "@/components/calendar-home";
import Link from "@/components/app-link";
import { PaymentHome } from "@/components/payment-home";
import { Layers } from "lucide-react";
import { requireMember } from "@/features/identity/session";
import { digestData } from "@/features/digest/queries";
import { TodayCard } from "@/components/today-card";
export const maxDuration = 60;
export default async function Home() {
  const { member } = await requireMember();
  const today = await digestData();
  const { segments, assignments } = today;
  const mine = segments.filter(
    (s) =>
      !s.archived_at &&
      assignments.some(
        (a) => a.segment_id === s.id && a.member_id === member.id,
      ),
  );
  const firstName = member.display_name?.split(" ")[0];
  return (
    <>
      <div className="page-heading">
        <h1>Home</h1>
        {firstName && <p className="muted">Hi, {firstName}.</p>}
      </div>
      <TodayCard
        digest={today.digest}
        unavailable={today.unavailable}
        calendarStale={today.calendarStale}
      />
      <div className="home-grid">
        {!today.unavailable.includes("Practice calendar") && <CalendarHome />}
        {!today.unavailable.includes("Payments") && <PaymentHome />}
      </div>
      {!today.unavailable.includes("Featured events") && (
        <FeaturedEvents compact />
      )}
      <section className="panel my-segments">
        <div className="section-toolbar">
          <h2>
            Your segments{" "}
            {!today.unavailable.includes("Set Design") && (
              <span className="count">{mine.length}</span>
            )}
          </h2>
          <Link className="text-button" href="/segments">
            All segments →
          </Link>
        </div>
        {today.unavailable.includes("Set Design") ? (
          <p className="notice error">
            Your assignments could not be loaded. Refresh to try again.
          </p>
        ) : mine.length ? (
          <div className="chip-list">
            {mine.map((segment) => (
              <Link
                className="chip-link"
                key={segment.id}
                href={`/segments/${segment.id}`}
              >
                <Layers size={16} aria-hidden="true" />
                {segment.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted small">No segments assigned.</p>
        )}
      </section>
      {member.is_admin &&
        !today.unavailable.includes("Messages") &&
        !today.unavailable.includes("Payments") && <AdminSummary />}
      <NotificationSettings />
    </>
  );
}
