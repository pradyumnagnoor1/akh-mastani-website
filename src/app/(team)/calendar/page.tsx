import { calendarData } from "@/features/calendar/queries";
import { CalendarSchedule } from "@/components/calendar-schedule";
export const maxDuration = 60;
export default async function Page() {
  const { calendar } = await calendarData();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MEET YOU ON THE FLOOR</p>
        <h1>
          Practice calendar<span className="accent">.</span>
        </h1>
        <p className="muted">
          Your team’s schedule, straight from Google Calendar.
        </p>
      </div>
      <CalendarSchedule initial={calendar} />
    </>
  );
}
