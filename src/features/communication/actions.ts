"use server";
import { schedulePush } from "@/features/notifications/dispatch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireMember } from "@/features/identity/session";
import { validatePost, validVersion } from "./policy";
import type { FormState } from "./types";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function revision(form: FormData) {
  const id = value(form, "id"),
    version = Number(form.get("version"));
  validVersion(id, version);
  return { target_id: id, expected_version: version };
}
function failure(error: { message: string; code?: string }): FormState {
  if (error.code === "23505")
    return {
      error: "That item or group already exists. Refresh before trying again.",
    };
  if (/changed|version|Refresh/i.test(error.message))
    return {
      error: "This item changed. Refresh the page before trying again.",
    };
  if (
    /active dancers|recipient|audience|source|group name|completion mode|title|body|due date/i.test(
      error.message,
    )
  )
    return {
      error:
        "Check the message and recipients. Refresh if team membership changed.",
    };
  return {
    error:
      "We could not confirm the update. Refresh before retrying; it may already be saved.",
  };
}
export async function saveCommunication(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  let input;
  try {
    args = revision(form);
    input = validatePost({
      title: value(form, "title"),
      body: value(form, "body"),
      kind: value(form, "kind"),
      mode: value(form, "mode"),
      audience: value(form, "audience"),
      members: form.getAll("members").map(String),
      sourceId: value(form, "source_id"),
      dueOn: value(form, "due_on"),
    });
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("save_communication", {
      ...args,
      post_kind: input.kind,
      post_title: input.title,
      post_body: input.body,
      task_mode: input.mode,
      audience: input.audience,
      recipient_ids: input.members,
      source_id: input.sourceId,
      due_date: input.dueOn,
    });
    if (error) return failure(error);
  } catch {
    return failure({ message: "Network error" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect(
    `/${input.kind === "task" ? "todos" : "announcements"}/${args.target_id}`,
  );
}
export async function completeCommunication(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireMember();
  let args;
  try {
    args = revision(form);
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("complete_communication", args);
    if (error) return failure(error);
  } catch {
    return failure({ message: "Network error" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  return { error: null, success: "Saved." };
}
export async function manageCommunication(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  const operation = value(form, "operation"),
    recipientId = value(form, "recipient_id") || null;
  try {
    args = revision(form);
    if (!["delete", "reopen"].includes(operation))
      throw new Error("Choose a valid action.");
    if (recipientId) validVersion(recipientId, 0);
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("manage_communication", {
      ...args,
      operation,
      recipient_id: recipientId,
    });
    if (error) return failure(error);
  } catch {
    return failure({ message: "Network error" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  if (operation === "delete") {
    redirect(value(form, "kind") === "task" ? "/todos" : "/announcements");
  }
  return { error: null, success: "Reopened." };
}
export async function saveGroup(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  const name = value(form, "name").trim(),
    members = [...new Set(form.getAll("members").map(String))];
  try {
    args = revision(form);
    if (!name || [...name].length > 100 || /[\u0000-\u001f\u007f]/.test(name))
      throw new Error("Use a group name of 1–100 characters.");
    if (!members.length) throw new Error("Choose at least one active dancer.");
    members.forEach((id) => validVersion(id, 0));
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("save_communication_group", {
      ...args,
      group_name: name,
      member_ids: members,
    });
    if (error) return failure(error);
  } catch {
    return failure({ message: "Network error" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect("/admin/groups");
}
export async function archiveGroup(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  try {
    args = revision(form);
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("archive_communication_group", args);
    if (error) return failure(error);
  } catch {
    return failure({ message: "Network error" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect("/admin/groups");
}
