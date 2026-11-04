import { calendarData } from "@/features/calendar/queries";
import { communicationData } from "@/features/communication/queries";
import { FeaturedEvents } from "@/components/featured-events";
import { CalendarSchedule } from "@/components/calendar-schedule";
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
