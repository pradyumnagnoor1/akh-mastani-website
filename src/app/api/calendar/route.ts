import { calendarData, CalendarAccessError } from "@/features/calendar/queries";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { calendar } = await calendarData();
    return Response.json(calendar, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    if (error instanceof CalendarAccessError)
      return Response.json(
        { error: "Active membership required" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    throw error;
  }
}
