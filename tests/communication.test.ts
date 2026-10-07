import { describe, it, expect } from "vitest";
import {
  validatePost,
  validVersion,
  type PostInput,
} from "../src/features/communication/policy";
const id = "00000000-0000-4000-8000-000000000001";
const base: PostInput = {
  title: " Practice reminder ",
  body: "Bring shoes\nAnd water",
  kind: "task",
  mode: "individual",
  audience: "individual",
  members: [id],
  sourceId: "",
  dueOn: "2028-02-29",
};
describe("communication input boundaries", () => {
  it("normalizes labels, preserves multiline text and calendar date", () => {
    expect(validatePost(base)).toMatchObject({
      title: "Practice reminder",
      body: base.body,
      dueOn: "2028-02-29",
      sourceId: null,
    });
  });
  it("deduplicates selected members", () => {
    expect(
      validatePost({ ...base, audience: "selected", members: [id, id] })
        .members,
    ).toEqual([id]);
  });
  it.each([
    { title: "" },
    { title: "x".repeat(161) },
    { body: " " },
    { body: "x".repeat(6001) },
    { title: "Hi\nthere" },
    { body: "bad\u0000body" },
    { kind: "payment" },
    { mode: "any" },
    { audience: "public" },
    { members: ["fake"] },
    { members: [] },
    { members: [id, "00000000-0000-4000-8000-000000000002"] },
    { dueOn: "2027-02-29" },
    { dueOn: "2026-13-01" },
    { dueOn: "2026-1-1" },
    { audience: "segment", sourceId: "" },
    { audience: "group", sourceId: "bad" },
    { kind: "announcement", mode: "shared" },
  ])("rejects invalid input %j", (patch) => {
    expect(() => validatePost({ ...base, ...patch })).toThrow();
  });
  it("accepts group targets without explicit member IDs", () => {
    expect(
      validatePost({
        ...base,
        audience: "group",
        sourceId: id,
        members: [],
        dueOn: "",
      }),
    ).toMatchObject({ sourceId: id, dueOn: null });
  });
  it("accepts new and existing revisions", () => {
    expect(() => validVersion(id, 0)).not.toThrow();
    expect(() => validVersion(id, 2)).not.toThrow();
  });
  it.each([-1, 1.5, NaN])("rejects invalid version %s", (version) =>
    expect(() => validVersion(id, version)).toThrow(),
  );
});
