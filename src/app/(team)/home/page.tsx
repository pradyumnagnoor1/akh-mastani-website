import { AdminSummary } from "@/components/admin-summary";
import { CalendarHome } from "@/components/calendar-home";
import Link from "next/link";
import { PaymentHome } from "@/components/payment-home";
import { CommunicationHome } from "@/components/communication-home";
import { ArrowUpRight, Users, ShieldCheck, Music2 } from "lucide-react";
import { segmentData } from "@/features/segments/queries";
export const maxDuration = 60;
export default async function Home() {
  const { member, supabase, segments, assignments } = await segmentData();
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
  if (error) throw new Error("Unable to load team overview.");
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">YOUR TEAM SPACE</p>
        <h1>
          Hey, {member.display_name?.split(" ")[0]}
          <span className="accent">.</span>
        </h1>
        <p className="muted">Your people. Your place. All together.</p>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="pill">
            <Music2 size={14} /> AKH MASTANI
          </span>
          <h2>
            Every dancer.
            <br />
            Part of something bigger.
          </h2>
          <p>You’re in the team space. Start by finding your teammates.</p>
          <Link href="/roster" className="button light">
            Meet the team <ArrowUpRight size={18} />
          </Link>
        </div>
        <span className="banner-art" aria-hidden="true">
          ✦
        </span>
      </section>
      {member.is_admin && <AdminSummary />}
      <CommunicationHome />
      <PaymentHome />
      <CalendarHome />
      <div className="home-grid">
        <Link href="/roster" className="panel summary-card">
          <Users className="accent" />
          <span className="metric">{count ?? 0}</span>
          <h3>Dancers in step</h3>
          <p className="muted">
            Explore the team roster <ArrowUpRight size={15} />
          </p>
        </Link>
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
        </section>
      </div>
      <section className="panel my-segments">
        <div className="section-toolbar">
          <h2>
            Your segments <span className="count">{mine.length}</span>
          </h2>
          <Link className="text-button" href="/segments">
            View all segments →
          </Link>
        </div>
        {mine.length ? (
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
          <p className="muted small">
            Your admins haven’t assigned you to a segment yet. You can still
            explore the full set.
          </p>
        )}
      </section>
      {member.is_admin && (
        <Link href="/admin" className="admin-shortcut">
          Manage team access{" "}
          <span>
            Review members and pending requests <ArrowUpRight size={18} />
          </span>
        </Link>
      )}
    </>
  );
}
