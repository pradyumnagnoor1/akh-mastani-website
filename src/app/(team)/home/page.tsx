import { FeaturedEvents } from "@/components/featured-events";
import { NotificationSettings } from "@/components/notification-settings";
import { AdminSummary } from "@/components/admin-summary";
import { CalendarHome } from "@/components/calendar-home";
import Link from "@/components/app-link";
import { PaymentHome } from "@/components/payment-home";
import { CommunicationHome } from "@/components/communication-home";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { requireMember } from "@/features/identity/session";
import { digestData } from "@/features/digest/queries";
import { TodayCard } from "@/components/today-card";
export const maxDuration = 60;
export default async function Home() {
  const { member, supabase } = await requireMember();
  const today = await digestData();
  const { segments, assignments } = today;
  const mine = segments.filter(
    (s) =>
      !s.archived_at &&
      assignments.some(
        (a) => a.segment_id === s.id && a.member_id === member.id,
      ),
  );
  const { count, error } = await supabase
    .from("members")
    .select("id", { head: true, count: "exact" })
    .eq("status", "active");
  return (
    <>
      <div className="page-heading">
        <h1>Home</h1>
      </div>
      <TodayCard
        digest={today.digest}
        unavailable={today.unavailable}
        calendarStale={today.calendarStale}
      />
      {!today.unavailable.includes("Messages") && <CommunicationHome />}
      {!today.unavailable.includes("Featured events") && (
        <FeaturedEvents compact />
      )}
      {!today.unavailable.includes("Practice calendar") && <CalendarHome />}
      {!today.unavailable.includes("Payments") && <PaymentHome />}
      {member.is_admin &&
        !error &&
        !today.unavailable.includes("Messages") &&
        !today.unavailable.includes("Payments") && <AdminSummary />}
      <section className="panel my-segments">
        <div className="section-toolbar">
          <h2>
            Your segments{" "}
            {!today.unavailable.includes("Set Design") && (
              <span className="count">{mine.length}</span>
            )}
          </h2>
          <Link className="text-button" href="/segments">
            View all segments →
          </Link>
        </div>
        {today.unavailable.includes("Set Design") ? (
          <p className="notice error">
            Your assignments could not be loaded. Refresh to try again.
          </p>
        ) : mine.length ? (
          mine.map((segment) => (
            <Link
              className="my-segment-row"
              key={segment.id}
              href={`/segments/${segment.id}`}
            >
              <strong>{segment.name}</strong>
              <span className="muted small">
                Formations & lineup <ArrowUpRight size={16} />
              </span>
            </Link>
          ))
        ) : (
          <p className="muted small">No segments assigned.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <ShieldCheck size={20} />
          <h3>Your membership</h3>
          <span className="badge success">Active</span>
        </div>
        <dl className="details">
          <div>
            <dt>Name</dt>
            <dd>{member.display_name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{member.email}</dd>
          </div>
          <div>
            <dt>Team role</dt>
            <dd>Dancer{member.is_admin ? " · Admin access" : ""}</dd>
          </div>
        </dl>
        <Link href="/roster" className="text-button">
          Team roster{!error && ` · ${count ?? 0} members`}{" "}
          <ArrowUpRight size={15} />
        </Link>
      </section>
      {member.is_admin && (
        <Link href="/admin" className="admin-shortcut">
          Manage team access{" "}
          <span>
            Review members and pending requests <ArrowUpRight size={18} />
          </span>
        </Link>
      )}
      <NotificationSettings />
    </>
  );
}
