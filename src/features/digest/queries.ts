import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { communicationData } from "@/features/communication/queries";
import { paymentData } from "@/features/payments/queries";
import { segmentData } from "@/features/segments/queries";
import { calendarData } from "@/features/calendar/queries";
import { featuredData } from "@/features/featured-events/queries";
import { buildDigest } from "./policy";

export const digestData = cache(async () => {
  // Authentication is never inside partial-data recovery.
  const { member } = await requireMember();
  const sources = await Promise.allSettled([
    communicationData(),
    paymentData(),
    segmentData(),
    calendarData(),
    featuredData(),
  ]);
  const [communication, payments, segments, calendar, featured] = sources;
  const unavailable = sources.flatMap((s, i) =>
    s.status === "rejected"
      ? [
          [
            "Messages",
            "Payments",
            "Set Design",
            "Practice calendar",
            "Featured events",
          ][i],
        ]
      : [],
  );
  if (
    calendar.status === "fulfilled" &&
    calendar.value.calendar.configured &&
    calendar.value.calendar.unavailable
  )
    unavailable.push("Practice calendar");
  const input = {
    memberId: member.id,
    now: new Date(),
    posts:
      communication.status === "fulfilled" ? communication.value.posts : [],
    recipients:
      communication.status === "fulfilled"
        ? communication.value.recipients
        : [],
    charges: payments.status === "fulfilled" ? payments.value.charges : [],
    segments: segments.status === "fulfilled" ? segments.value.segments : [],
    assignments:
      segments.status === "fulfilled" ? segments.value.assignments : [],
    calendar:
      calendar.status === "fulfilled" ? calendar.value.calendar.events : [],
    featured: featured.status === "fulfilled" ? featured.value.events : [],
  };
  return {
    digest: buildDigest(input),
    unavailable,
    segments: input.segments,
    assignments: input.assignments,
    calendarStale:
      calendar.status === "fulfilled" &&
      calendar.value.calendar.configured &&
      calendar.value.calendar.stale,
  };
});
