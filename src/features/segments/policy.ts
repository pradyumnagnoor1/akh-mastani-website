export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function segmentName(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value))
    throw new Error("Enter a segment name without control characters.");
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || [...clean].length > 100)
    throw new Error("Use 1–100 characters for the segment name.");
  return clean;
}
export function selectedMembers(values: string[]): string[] {
  if (values.some((value) => !UUID.test(value)))
    throw new Error("Choose dancers from the roster.");
  return [...new Set(values)];
}
export async function validatePdf(file: File): Promise<void> {
  if (!file.size || file.size > MAX_PDF_BYTES)
    throw new Error("Choose a nonempty PDF up to 4 MB.");
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    (file.type && file.type !== "application/pdf")
  )
    throw new Error("Choose a PDF document.");
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (header !== "%PDF-")
    throw new Error("This file does not have a PDF signature.");
}
export type Segment = {
  id: string;
  name: string;
  document_path: string;
  document_label: string;
  version: number;
  archived_at: string | null;
  updated_at: string;
};
export type Assignment = { segment_id: string; member_id: string };
