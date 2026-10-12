import { it, expect } from "vitest";
import {
  buildDigest,
  announcementExcerpt,
  chicagoDay,
} from "../src/features/digest/policy";
import type { CommunicationPost } from "../src/features/communication/types";
const now = new Date("2026-10-12T15:00:00Z");
const post = {
  id: "p",
  title: "Bring shoes",
  body: "Bring black shoes to practice. We will rehearse the opener.",
  kind: "announcement",
  completion_mode: "individual",
  archived_at: null,
  created_at: now.toISOString(),
  completed_at: null,
} as CommunicationPost;
const base = {
  memberId: "a",
  now,
  posts: [post],
  recipients: [{ post_id: "p", member_id: "a", completed_at: null }],
  charges: [],
  segments: [],
  assignments: [],
  calendar: [],
  featured: [],
};
it("shows an excerpt without author input or interpreting content", () => {
  expect(announcementExcerpt(post.body)).toBe(post.body);
  expect(announcementExcerpt("x".repeat(200))).toHaveLength(150);
  expect(announcementExcerpt("😀".repeat(200))).toMatch(/…$/);
});
it("filters personal data even when an admin query can see all records", () => {
  expect(buildDigest(base).items).toHaveLength(1);
  expect(buildDigest({ ...base, memberId: "b" }).items).toEqual([]);
});
it("suppresses acknowledged and expired announcements", () => {
  expect(
    buildDigest({
      ...base,
      recipients: [
        { post_id: "p", member_id: "a", completed_at: now.toISOString() },
      ],
    }).items,
  ).toEqual([]);
  expect(
    buildDigest({
      ...base,
      posts: [{ ...post, expires_at: now.toISOString() }],
    }).items,
  ).toEqual([]);
});
it("handles Central dates including midnight and daylight saving", () => {
  expect(chicagoDay(new Date("2026-10-12T03:00:00Z"))).toBe("2026-10-11");
  expect(chicagoDay(new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
});
it("excludes formation and assignment updates from the digest", () => {
  const segment = {
    id: "s",
    name: "Opener",
    updated_at: now.toISOString(),
    archived_at: null,
    version: 2,
    document_path: "x",
    document_label: "PDF",
  };
  expect(
    buildDigest({
      ...base,
      posts: [],
      segments: [segment],
      assignments: [{ segment_id: "s", member_id: "a" }],
    }).items,
  ).toEqual([]);
  expect(
    buildDigest({
      ...base,
      posts: [],
      segments: [{ ...segment, formation_updated_at: now.toISOString() }],
      assignments: [{ segment_id: "s", member_id: "a" }],
    }).items,
  ).toEqual([]);
});

it("includes all incomplete assignments ahead of announcements, ordered by urgency", () => {
  const tasks = ["2026-10-11", "2026-10-12", "2026-10-14", null].map(
    (due_on, i) => ({ ...post, id: `t${i}`, kind: "task" as const, due_on }),
  );
  const digest = buildDigest({
    ...base,
    posts: [post, ...tasks],
    recipients: [
      ...base.recipients,
      ...tasks.map((t) => ({
        post_id: t.id,
        member_id: "a",
        completed_at: null,
      })),
    ],
  });
  expect(digest.items.map((i) => i.id)).toEqual([
    "task-t0",
    "task-t1",
    "task-t2",
    "task-t3",
    "announcement-p",
  ]);
  expect(digest.items.map((i) => i.detail).slice(0, 4)).toEqual([
    "Overdue · due 2026-10-11",
    "To-do · due today",
    "To-do · due 2026-10-14",
    "To-do · no due date",
  ]);
});
it("uses saved shared read/completion status consistently with the detail page", () => {
  for (const kind of ["task", "announcement"] as const) {
    expect(
      buildDigest({
        ...base,
        posts: [
          {
            ...post,
            kind,
            completion_mode: "shared",
            completed_at: now.toISOString(),
          },
        ],
      }).items,
    ).toEqual([]);
    expect(
      buildDigest({
        ...base,
        posts: [{ ...post, kind, completion_mode: "individual" }],
        recipients: [
          { post_id: "p", member_id: "a", completed_at: now.toISOString() },
        ],
      }).items,
    ).toEqual([]);
  }
});
