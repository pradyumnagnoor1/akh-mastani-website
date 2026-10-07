import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/features/identity/session";
import { UUID, MAX_PDF_BYTES } from "@/features/segments/policy";
export const dynamic = "force-dynamic";
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase } = await requireMember();
  const { id } = await params;
  if (!UUID.test(id))
    return new NextResponse("Formation document not found.", {
      status: 404,
      headers: privateHeaders,
    });
  const { data: segment, error } = await supabase
    .from("segments")
    .select("document_path")
    .eq("id", id)
    .maybeSingle();
  if (error)
    return new NextResponse("Unable to load the document. Please try again.", {
      status: 503,
      headers: privateHeaders,
    });
  if (!segment)
    return new NextResponse("Formation document not found.", {
      status: 404,
      headers: privateHeaders,
    });
  // Download with this user's session; Storage RLS rechecks current membership and segment access.
  const { data: file, error: downloadError } = await supabase.storage
    .from("formations")
    .download(segment.document_path);
  if (downloadError || !file)
    return new NextResponse(
      "The formation PDF is temporarily unavailable. Please try again.",
      { status: 503, headers: privateHeaders },
    );
  if (file.size > MAX_PDF_BYTES)
    return new NextResponse("The PDF exceeds the supported size.", {
      status: 413,
      headers: privateHeaders,
    });
  return new NextResponse(file, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="formations-${id}.pdf"`,
      "Content-Length": String(file.size),
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
    },
  });
}
