import { calendarData } from "@/features/calendar/queries";
import { communicationData } from "@/features/communication/queries";
import { FeaturedEvents } from "@/components/featured-events";
import { CalendarSchedule } from "@/components/calendar-schedule";
import Link from "@/components/app-link";
export const maxDuration = 60;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ calendar, member }, { posts }, params] = await Promise.all([
    calendarData(),
    communicationData(),
    searchParams,
  ]);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Practice calendar</h1>
          <p className="muted">
            Google Calendar is a reference schedule. Practice announcements
            contain website practice events.
          </p>
        </div>
        {member.is_admin && (
          <Link href="/calendar/featured/new" className="button primary">
            Add featured event
          </Link>
        )}
      </div>
      <FeaturedEvents />
      <CalendarSchedule
        key={params.date ?? "today"}
        initial={calendar}
        announcements={posts.filter((p) => p.kind === "announcement")}
        featured={[]}
        admin={member.is_admin}
        initialDay={params.date}
        serverNow={new Date().toISOString()}
      />
    </>
  );
}
