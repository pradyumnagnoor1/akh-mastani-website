import { requireMember } from "@/features/identity/session";
import { UUID } from "@/features/segments/policy";
import { MAX_IMAGE_BYTES } from "@/features/announcement-images/validate";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase } = await requireMember();
  const { id } = await params;
  if (!UUID.test(id))
    return new Response("Not found", { status: 404, headers });
  const post = await supabase
    .from("communication_posts")
    .select("image_path,expires_at")
    .eq("id", id)
    .eq("kind", "announcement")
    .maybeSingle();
  if (post.error)
    return new Response("Image unavailable", { status: 503, headers });
  if (
    !post.data?.image_path ||
    (post.data.expires_at && Date.parse(post.data.expires_at) <= Date.now())
  )
    return new Response("Not found", { status: 404, headers });
  const file = await supabase.storage
    .from("announcement-images")
    .download(post.data.image_path);
  if (file.error || !file.data)
    return new Response("Image unavailable", { status: 503, headers });
  if (file.data.size > MAX_IMAGE_BYTES)
    return new Response("Image unavailable", { status: 413, headers });
  return new Response(file.data, {
    headers: {
      ...headers,
      "Content-Type": "image/jpeg",
      "Content-Disposition": 'inline; filename="announcement.jpg"',
      "Content-Length": String(file.data.size),
    },
  });
}
