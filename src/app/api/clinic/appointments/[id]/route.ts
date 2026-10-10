import { getStore } from "@/lib/portal/store";
import {
  requireStaff,
  sameOrigin,
  body,
  text,
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
    if (input.action === "rename") {
      const label = text(input.patientLabel, 100);
      const previous = text(input.previousLabel, 100);
      if (/[\u0000-\u001f\u007f]/.test(label))
        throw new PortalError(400, "BAD_REQUEST", "בדקו את הפרטים שהזנתם.");
      if (!(await getStore().rename(id, label, previous)))
        throw new PortalError(
          409,
          "CARD_CHANGED",
          "התיק השתנה. רעננו ונסו שוב.",
        );
    } else if (input.action === "revoke") await getStore().revoke(id);
    else if (input.action === "review") await getStore().review(id);
    else throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    await getStore().audit({
      event:
        input.action === "revoke"
          ? "staff_revoked_invitation"
          : input.action === "rename"
            ? "staff_renamed_appointment"
            : "staff_reviewed_appointment",
      actor_id: staff.id,
      appointment_id: id,
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const staff = await requireStaff(),
      { id } = await params,
      input = await body(request);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      input.confirmed !== true
    )
      throw new PortalError(
        400,
        "CONFIRMATION_REQUIRED",
        "אשרו את מחיקת התיק.",
      );
    const confirmation = text(input.patientLabel, 100);
    const a = await getStore().appointment(id);
    if (!a) throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
    if (a.patient_label !== confirmation)
      throw new PortalError(
        409,
        "CARD_CHANGED",
        "התיק השתנה. רעננו לפני המחיקה.",
      );
    if (!(await getStore().deleteAppointment(id, staff.id, confirmation)))
      throw new PortalError(
        409,
        "DELETE_FAILED",
        "המחיקה לא הושלמה. רעננו ונסו שוב.",
      );
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
