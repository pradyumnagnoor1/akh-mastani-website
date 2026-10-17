import { calendarData } from "@/features/calendar/queries";
import { communicationData } from "@/features/communication/queries";
import { featuredData } from "@/features/featured-events/queries";
import { CalendarSchedule } from "@/components/calendar-schedule";
import Link from "@/components/app-link";
export const maxDuration = 60;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ calendar, member }, { posts }, { events }, params] =
    await Promise.all([
      calendarData(),
      communicationData(),
      featuredData(),
      searchParams,
    ]);
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <h1>Practice calendar</h1>
          <p className="muted">
            Your day’s practices, events and team updates.
          </p>
        </div>
        {member.is_admin && (
          <Link href="/calendar/featured/new" className="button primary">
            Add featured event
          </Link>
        )}
      </div>
      <CalendarSchedule
        key={params.date ?? "today"}
        initial={calendar}
        announcements={posts.filter((p) => p.kind === "announcement")}
        featured={events}
        admin={member.is_admin}
        initialDay={params.date}
        serverNow={new Date().toISOString()}
      />
    </>
  );
}
