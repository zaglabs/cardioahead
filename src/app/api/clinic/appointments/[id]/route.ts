import { getStore } from "@/lib/portal/store";
import {
  requireStaff,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const staff = await requireStaff();
    const { id } = await params;
    const input = await body(request);
    if (!(await getStore().appointment(id)))
      throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
    if (input.action === "revoke") await getStore().revoke(id);
    else if (input.action === "review") await getStore().review(id);
    else throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    await getStore().audit({
      event:
        input.action === "revoke"
          ? "staff_revoked_invitation"
          : "staff_reviewed_appointment",
      actor_id: staff.id,
      appointment_id: id,
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
