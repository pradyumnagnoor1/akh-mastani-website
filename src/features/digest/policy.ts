import type {
  CommunicationPost,
  Recipient,
} from "@/features/communication/types";
import type { Charge } from "@/features/payments/types";
import type { Segment, Assignment } from "@/features/segments/policy";
import type { CalendarEvent } from "@/features/calendar/types";
import type { FeaturedEvent } from "@/features/featured-events/types";

export const TEAM_ZONE = "America/Chicago";
export function chicagoDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function announcementExcerpt(body: string, limit = 150) {
  const text = body.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const cut = characters.slice(0, limit - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${space > limit * 0.6 ? cut.slice(0, space) : cut}…`;
}
export type DigestItem = {
  id: string;
  section: "Needs attention" | "Announcements" | "Your updates";
  title: string;
  detail: string;
  href: string;
  priority: number;
  order: string;
};
export type DigestSchedule = {
  id: string;
  title: string;
  detail: string;
  href: string;
  day: string;
  order: string;
};
export function buildDigest(input: {
  memberId: string;
  now: Date;
  posts: CommunicationPost[];
  recipients: Recipient[];
  charges: Charge[];
  segments: Segment[];
  assignments: Assignment[];
  calendar: CalendarEvent[];
  featured: FeaturedEvent[];
}) {
  const { memberId, now } = input;
  const today = chicagoDay(now);
  const recent = now.getTime() - 7 * 86400_000;
  const items: DigestItem[] = [];
  const live = (expires?: string | null) =>
    !expires || Date.parse(expires) > now.getTime();
  for (const post of input.posts) {
    const recipient = input.recipients.find(
      (r) => r.post_id === post.id && r.member_id === memberId,
    );
    if (!recipient || post.archived_at || !live(post.expires_at)) continue;
    const done =
      post.kind === "task" && post.completion_mode === "shared"
        ? !!post.completed_at
        : !!recipient.completed_at;
    if (done) continue;
    if (post.kind === "task" && post.due_on && post.due_on <= today)
      items.push({
        id: `task-${post.id}`,
        section: "Needs attention",
        title: post.title,
        detail:
          post.due_on < today
            ? `Overdue · due ${post.due_on}`
            : "To-do · due today",
        href: `/todos/${post.id}`,
        priority: post.due_on < today ? 0 : 1,
        order: post.due_on,
      });
    if (post.kind === "announcement" && Date.parse(post.created_at) >= recent)
      items.push({
        id: `announcement-${post.id}`,
        section: "Announcements",
        title: post.title,
        detail: announcementExcerpt(post.body),
        href: `/announcements/${post.id}`,
        priority: 4,
        order: String(-Date.parse(post.created_at)),
      });
  }
  for (const charge of input.charges) {
    if (
      charge.member_id !== memberId ||
      charge.status !== "unpaid" ||
      !charge.due_on ||
      charge.due_on > today
    )
      continue;
    items.push({
      id: `payment-${charge.id}`,
      section: "Needs attention",
      title: charge.reason,
      detail:
        charge.due_on < today
          ? `Payment overdue · due ${charge.due_on}`
          : "Payment due today",
      href: `/payments/${charge.id}`,
      priority: charge.due_on < today ? 2 : 3,
      order: charge.due_on,
    });
  }
  for (const segment of input.segments) {
    if (
      segment.archived_at ||
      !input.assignments.some(
        (a) => a.segment_id === segment.id && a.member_id === memberId,
      )
    )
      continue;
    for (const [label, stamp] of [
      ["Formation updated", segment.formation_updated_at],
      ["Assignments updated", segment.assignments_updated_at],
    ] as const) {
      if (!stamp || Date.parse(stamp) < recent) continue;
      items.push({
        id: `${label}-${segment.id}`,
        section: "Your updates",
        title: segment.name,
        detail: label,
        href: `/segments/${segment.id}`,
        priority: 5,
        order: String(-Date.parse(stamp)),
      });
    }
  }
  items.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.order.localeCompare(b.order) ||
      a.id.localeCompare(b.id),
  );
  const time = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: TEAM_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  const schedule: DigestSchedule[] = [];
  for (const event of input.calendar) {
    const startDay = event.allDay
      ? event.start
      : chicagoDay(new Date(event.start));
    if (
      event.allDay ? event.end <= today : Date.parse(event.end) <= now.getTime()
    )
      continue;
    const day = startDay < today ? today : startDay;
    schedule.push({
      id: `practice-${event.id}`,
      title: event.title,
      detail: `${event.allDay ? "All day" : time(new Date(event.start))}${event.location ? ` · ${event.location}` : ""}`,
      href: "/calendar",
      day,
      order: event.allDay
        ? `${day}T00:00`
        : `${day}T${new Intl.DateTimeFormat("en-GB", { timeZone: TEAM_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.start))}`,
    });
  }
  for (const event of input.featured) {
    if (event.deleted_at || event.event_date < today || !live(event.expires_at))
      continue;
    if (event.event_date === today && event.start_time) {
      const current = new Intl.DateTimeFormat("en-GB", {
        timeZone: TEAM_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      if (event.start_time.slice(0, 5) < current) continue;
    }
    const clock = event.start_time
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(`2000-01-01T${event.start_time}Z`))
      : "All day";
    schedule.push({
      id: `featured-${event.id}`,
      title: event.title,
      detail: `${clock}${event.location ? ` · ${event.location}` : ""}`,
      href: "/calendar",
      day: event.event_date,
      order: `${event.event_date}T${event.start_time ?? "00:00"}`,
    });
  }
  schedule.sort(
    (a, b) => a.order.localeCompare(b.order) || a.id.localeCompare(b.id),
  );
  return {
    today,
    items,
    schedule: schedule.filter((e) => e.day === today),
    next: schedule[0] ?? null,
    awaitingVerification: input.charges.filter(
      (c) => c.member_id === memberId && c.status === "reported",
    ).length,
  };
}
