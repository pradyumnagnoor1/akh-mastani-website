import { expect, it } from "vitest";
import { compareImportance } from "../src/features/communication/importance";
import type { CommunicationPost } from "../src/features/communication/types";
const post = (id: string, extra: Partial<CommunicationPost> = {}) =>
  ({
    id,
    kind: "task",
    created_at: "2026-11-04",
    due_on: null,
    ...extra,
  }) as CommunicationPost;
const sort = (posts: CommunicationPost[]) =>
  posts
    .sort((a, b) => compareImportance(a, b, (p) => !!p.pinned_at))
    .map((p) => p.id);
it("places pins before urgent tasks and newest pins first", () => {
  expect(
    sort([
      post("urgent", { priority: "urgent" }),
      post("older", { pinned_at: "2026-11-01" }),
      post("newer", { pinned_at: "2026-11-02" }),
    ]),
  ).toEqual(["newer", "older", "urgent"]);
});
it("orders priority then due date and uses Normal for existing tasks", () => {
  expect(
    sort([
      post("normal"),
      post("low", { priority: "low" }),
      post("later", { priority: "high", due_on: "2026-12-01" }),
      post("soon", { priority: "high", due_on: "2026-11-10" }),
    ]),
  ).toEqual(["soon", "later", "normal", "low"]);
});
