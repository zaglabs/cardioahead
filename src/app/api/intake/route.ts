// Deliberately fail closed. Do not parse, persist, or forward any request body.
function unavailable() {
  return Response.json(
    {
      error: "INTAKE_UNAVAILABLE",
      message: "Medical document intake is not configured.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = unavailable;
export const POST = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;
