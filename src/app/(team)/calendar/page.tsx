import { calendarData } from "@/features/calendar/queries";
import { CalendarSchedule } from "@/components/calendar-schedule";
import { FeaturedEvents } from "@/components/featured-events";
export const maxDuration = 60;
export default async function Page() {
  const { calendar } = await calendarData();
  return (
    <>
      <div className="page-heading">
        <h1>Practice calendar</h1>
        <p className="muted">Team practices and featured events.</p>
      </div>
      <FeaturedEvents />
      <CalendarSchedule initial={calendar} />
    </>
  );
}
