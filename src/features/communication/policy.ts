import type { Audience, CompletionMode, PostKind } from "./types";
export type PostInput = {
  title: string;
  body: string;
  kind: string;
  mode: string;
  audience: string;
  members: string[];
  sourceId: string;
  dueOn: string;
};
export type ValidPostInput = Omit<
  PostInput,
  "kind" | "mode" | "audience" | "dueOn" | "sourceId"
> & {
  kind: PostKind;
  mode: CompletionMode;
  audience: Audience;
  dueOn: string | null;
  sourceId: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePost(input: PostInput): ValidPostInput {
  const title = input.title.trim().replace(/ +/g, " "),
    body = input.body.trim();
  if (!title || [...title].length > 160 || /[\u0000-\u001f\u007f]/.test(title))
    throw new Error("Use a title of 1–160 characters on one line.");
  if (
    !body ||
    [...body].length > 6000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)
  )
    throw new Error("Use a message of 1–6,000 characters.");
  if (
    !["announcement", "task"].includes(input.kind) ||
    !["individual", "shared"].includes(input.mode) ||
    (input.kind === "announcement" && input.mode !== "individual")
  )
    throw new Error("Choose a valid item type and completion mode.");
  if (
    !["individual", "selected", "group", "segment", "team"].includes(
      input.audience,
    )
  )
    throw new Error("Choose who this is for.");
  const members = [...new Set(input.members)];
  if (members.some((id) => !uuid.test(id)))
    throw new Error("Choose dancers from the roster.");
  if (
    (input.audience === "individual" && members.length !== 1) ||
    (input.audience === "selected" && members.length === 0)
  )
    throw new Error("Choose the intended dancers.");
  const sourceId = input.sourceId || null;
  if (
    ["group", "segment"].includes(input.audience) &&
    (!sourceId || !uuid.test(sourceId))
  )
    throw new Error("Choose a group or segment.");
  if (!["group", "segment"].includes(input.audience) && sourceId)
    throw new Error("This audience cannot reference a group or segment.");
  const dueOn = input.dueOn || null;
  if (
    dueOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ||
      !Number.isFinite(Date.parse(dueOn)) ||
      new Date(dueOn).toISOString().slice(0, 10) !== dueOn ||
      dueOn < "1900-01-01" ||
      dueOn > "2200-12-31")
  )
    throw new Error("Enter a valid due date.");
  return {
    ...input,
    title,
    body,
    members,
    sourceId,
    dueOn,
    kind: input.kind as PostKind,
    mode: input.mode as CompletionMode,
    audience: input.audience as Audience,
  };
}
export function validVersion(id: string, version: number): void {
  if (!uuid.test(id) || !Number.isInteger(version) || version < 0)
    throw new Error("This form is out of date. Refresh and try again.");
}
