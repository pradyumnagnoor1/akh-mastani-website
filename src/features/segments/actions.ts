"use server";
import { schedulePush } from "@/features/notifications/dispatch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/identity/session";
import { segmentName, selectedMembers, validatePdf, UUID } from "./policy";
export type SegmentFormState = { error: string | null };

export async function saveSegment(
  _state: SegmentFormState,
  form: FormData,
): Promise<SegmentFormState> {
  const { supabase, member } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const version = Number(form.get("version"));
  if (!UUID.test(id) || !Number.isInteger(version) || version < 0)
    return { error: "This form is out of date. Refresh and try again." };
  let name: string, ids: string[];
  try {
    name = segmentName(String(form.get("name") ?? ""));
    ids = selectedMembers(form.getAll("members").map(String));
  } catch (error) {
    return { error: (error as Error).message };
  }
  let path: string | null = null,
    label: string | null = null;
  if (version > 0) {
    const existing = await supabase
      .from("segments")
      .select("document_path,document_label,version,archived_at")
      .eq("id", id)
      .single();
    if (
      existing.error ||
      existing.data.archived_at ||
      existing.data.version !== version
    )
      return {
        error: "Another admin changed this segment. Refresh before saving.",
      };
    path = existing.data.document_path;
    label = existing.data.document_label;
  }
  const file = form.get("pdf");
  try {
    if (file instanceof File && file.size > 0) {
      await validatePdf(file);
      path = `${member.id}/${crypto.randomUUID()}.pdf`;
      label =
        file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) ||
        "formations.pdf";
      const uploaded = await supabase.storage
        .from("formations")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploaded.error)
        return {
          error:
            "The PDF could not be uploaded. Your segment has not been changed. Try again.",
        };
    }
    if (!path || !label)
      return { error: "Add a formation PDF before creating this segment." };
    const { error } = await supabase.rpc("save_segment", {
      target_id: id,
      expected_version: version,
      segment_name: name,
      member_ids: ids,
      pdf_path: path,
      pdf_label: label,
    });
    if (error) {
      // Never delete an uploaded object here: the database may have committed despite a lost response.
      if (error.code === "23505")
        return {
          error:
            "An active segment already uses that name. Choose a different name.",
        };
      if (error.message.includes("changed"))
        return {
          error:
            "This segment changed while you were editing. Refresh before saving again.",
        };
      if (error.message.includes("active dancers"))
        return {
          error:
            "Someone selected is no longer active. Refresh the roster before saving.",
        };
      return {
        error:
          "We could not confirm the save. Refresh the segment list before retrying; your change may already be saved.",
      };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error &&
        (error.message.includes("PDF") || error.message.includes("4 MB"))
          ? error.message
          : "We could not confirm the save. Refresh the segment list before retrying.",
    };
  }
  schedulePush();
  revalidatePath("/", "layout");
  redirect(`/segments/${id}`);
}
export async function removeSegment(
  _state: SegmentFormState,
  form: FormData,
): Promise<SegmentFormState> {
  const { supabase } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const version = Number(form.get("version"));
  if (
    !UUID.test(id) ||
    !Number.isInteger(version) ||
    version < 1 ||
    form.get("confirm") !== "yes"
  )
    return { error: "Confirm that you want to remove this segment." };
  const { error } = await supabase.rpc("archive_segment", {
    target_id: id,
    expected_version: version,
  });
  if (error)
    return {
      error:
        "We could not confirm removal. Refresh before retrying; the segment may have changed.",
    };
  schedulePush();
  revalidatePath("/", "layout");
  redirect("/segments");
}
