import Link from "next/link";
import { requireAdmin } from "@/features/identity/session";
import { connectionConfig } from "@/features/calendar/config";
import { syncTime } from "@/features/calendar/types";
const messages: Record<string, string> = {
  connected:
    "Google Calendar connected. Open Practice Calendar to see the schedule.",
  disconnected: "Calendar disconnected. The saved schedule has been cleared.",
  cancelled:
    "Google authorization was cancelled. Your existing connection is unchanged.",
  failed:
    "Couldn’t complete the connection. Your existing connection is unchanged. Check Google access and setup, then try again.",
  "invalid-calendar":
    "Enter the calendar ID from Google Calendar settings. Use the team’s calendar ID rather than ‘primary’.",
};
export default async function CalendarConnection({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { supabase } = await requireAdmin();
  let ready = false;
  try {
    ready = !!connectionConfig();
  } catch {
    /* Setup state, never disclose secret configuration. */
  }
  const { data: status, error } = await supabase.rpc(
    "calendar_connection_status",
  );
  if (error)
    throw new Error(
      "Unable to load calendar connection. Check the calendar migration has been applied.",
    );
  const { result } = await searchParams;
  const connected = !!status?.calendar_id;
  return (
    <>
      <Link href="/admin" className="text-button">
        ← Team management
      </Link>
      <div className="page-heading">
        <p className="eyebrow">ONE CONNECTION FOR THE TEAM</p>
        <h1>
          Connect Google Calendar<span className="accent">.</span>
        </h1>
        <p className="muted">
          Authorize the team’s practice calendar once. Every approved dancer
          sees its schedule.
        </p>
      </div>
      {result && messages[result] && (
        <p role="status" className="notice">
          {messages[result]}
        </p>
      )}
      <section className="panel my-segments">
        <h2>
          {connected ? "Connected calendar" : "Connect your team calendar"}
        </h2>
        {connected && (
          <p className="muted calendar-connection-details">
            {status.calendar_id}
            {status.connected_at
              ? ` · Connected ${syncTime(status.connected_at)}`
              : ""}
          </p>
        )}
        {!ready ? (
          <p className="notice">
            Calendar connection setup is required before you can authorize
            Google. Follow the project’s calendar setup guide.
          </p>
        ) : (
          <>
            <form
              action="/api/calendar/oauth/start"
              method="post"
              className="stack"
            >
              <label htmlFor="calendar-id">Team calendar ID</label>
              <input
                id="calendar-id"
                name="calendar_id"
                required
                maxLength={1024}
                defaultValue={
                  status?.calendar_id ?? process.env.GOOGLE_CALENDAR_ID ?? ""
                }
                aria-describedby="calendar-help"
              />
              <p id="calendar-help" className="small muted">
                In Google Calendar, open Settings → your team calendar →
                Integrate calendar → Calendar ID. Authorize a Google account
                that can see its event details.
              </p>
              <button className="button primary" type="submit">
                {connected
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}
              </button>
            </form>
            {connected && (
              <form action="/api/calendar/oauth/disconnect" method="post">
                <input type="hidden" name="version" value={status.version} />
                <p className="small muted">
                  Disconnecting removes the shared calendar connection and saved
                  schedule from this website.
                </p>
                <button className="button secondary" type="submit">
                  Disconnect calendar
                </button>
              </form>
            )}
          </>
        )}
      </section>
      <p className="muted small">
        Schedule edits stay in Google Calendar. Dancers don’t need to authorize
        calendar access.
      </p>
      <Link href="/calendar" className="text-button">
        View practice calendar →
      </Link>
    </>
  );
}
