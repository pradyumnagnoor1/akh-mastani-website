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
it("does not label an ordinary segment rename as a formation update", () => {
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
    }).items[0].detail,
  ).toBe("Formation updated");
});
