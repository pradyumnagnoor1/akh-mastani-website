// Liveness only: intentionally no dependency queries or configuration disclosure.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
