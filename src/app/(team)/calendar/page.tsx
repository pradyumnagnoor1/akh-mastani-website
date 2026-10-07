import { calendarData } from "@/features/calendar/queries";
import { CalendarSchedule } from "@/components/calendar-schedule";
export const maxDuration = 60;
export default async function Page() {
  const { calendar } = await calendarData();
  return (
    <>
      <div className="page-heading">
        <h1>Practice calendar</h1>
        <p className="muted">Practice schedule from Google Calendar.</p>
      </div>
      <CalendarSchedule initial={calendar} />
    </>
  );
}
