import { json } from "@/lib/portal/security";
export function POST() {
  return json(
    {
      error: "INVITATION_REQUIRED",
      message: "העלאה מתבצעת דרך ההזמנה האישית מהמרפאה.",
    },
    401,
  );
}
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
