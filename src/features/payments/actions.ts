"use server";
import { schedulePush } from "@/features/notifications/dispatch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember, requireAdmin } from "@/features/identity/session";
import { validVersion, validatePost } from "@/features/communication/policy";
import { parseAmount } from "./policy";
import type { FormState } from "./types";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function failure(error: { message: string; code?: string }): FormState {
  if (error.code === "23505")
    return {
      error:
        "This charge batch already exists. Open All team before creating another.",
    };
  if (/changed|version/i.test(error.message))
    return { error: "This payment changed. Refresh before trying again." };
  return {
    error:
      "We could not confirm the update. Refresh before retrying; it may already be saved.",
  };
}
export async function issuePayments(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let args;
  try {
    const batch = value(form, "id");
    validVersion(batch, 0);
    const input = validatePost({
      title: value(form, "reason"),
      body: value(form, "instructions"),
      kind: "task",
      mode: "individual",
      audience: value(form, "audience"),
      members: form.getAll("members").map(String),
      sourceId: value(form, "source_id"),
      dueOn: value(form, "due_on"),
    });
    if (input.body.length > 3000)
      throw new Error("Payment instructions must be at most 3,000 characters.");
    args = {
      batch_id: batch,
      amount: parseAmount(value(form, "amount")),
      charge_reason: input.title,
      payment_instructions: input.body,
      due_date: input.dueOn,
      audience: input.audience,
      recipient_ids: input.members,
      source_id: input.sourceId,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("issue_payment_charges", args);
    if (error) return failure(error);
  } catch {
    return failure({ message: "network" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect("/payments?view=all");
}
export async function transitionPayment(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireMember();
  const id = value(form, "id"),
    version = Number(form.get("version")),
    operation = value(form, "operation"),
    note = value(form, "note").trim();
  try {
    validVersion(id, version);
    if (!["report", "verify", "reject", "waive"].includes(operation))
      throw new Error("Choose a valid action.");
    if (
      note.length > 1000 ||
      (["reject", "waive"].includes(operation) && !note)
    )
      throw new Error("Enter an explanation of 1–1,000 characters.");
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("transition_payment", {
      target_id: id,
      expected_version: version,
      operation,
      note,
    });
    if (error) return failure(error);
  } catch {
    return failure({ message: "network" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  return {
    error: null,
    success:
      operation === "report"
        ? "Payment reported. Awaiting admin verification."
        : "Payment updated.",
  };
}

export async function managePaymentCharge(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const operation = value(form, "operation");
  let args;
  try {
    const id = value(form, "id"),
      version = Number(form.get("version"));
    validVersion(id, version);
    if (!["update", "delete"].includes(operation))
      throw new Error("Choose a valid action.");
    const note = value(form, "note").trim();
    if (!note || [...note].length > 1000)
      throw new Error("Enter a change explanation of 1–1,000 characters.");
    let reason = "",
      instructions = "",
      amount: number | null = null,
      dueOn: string | null = null;
    if (operation === "update") {
      const input = validatePost({
        title: value(form, "reason"),
        body: value(form, "instructions"),
        kind: "task",
        mode: "individual",
        audience: "team",
        members: [],
        sourceId: "",
        dueOn: value(form, "due_on"),
      });
      if ([...input.body].length > 3000)
        throw new Error(
          "Payment instructions must be at most 3,000 characters.",
        );
      reason = input.title;
      instructions = input.body;
      amount = parseAmount(value(form, "amount"));
      dueOn = input.dueOn;
    }
    args = {
      target_id: id,
      expected_version: version,
      operation,
      amount,
      charge_reason: reason,
      payment_instructions: instructions,
      due_date: dueOn,
      note,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
  try {
    const { error } = await supabase.rpc("manage_payment_charge", args);
    if (error) return failure(error);
  } catch {
    return failure({ message: "network" });
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect(
    operation === "update"
      ? `/payments/${args.target_id}`
      : "/payments?view=all",
  );
}
