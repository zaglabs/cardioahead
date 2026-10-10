import {
  requireStaff,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import {
  invitationById,
  invitationCredentials,
  manageInvitation,
  issueInvitation,
  reserveSend,
  finishSend,
} from "@/lib/invitations/store";
import { sendStoredReportNotice } from "@/lib/portal/resend";
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staff = await requireStaff(),
      { id } = await params;
    if (!uuid(id)) throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    const row = await invitationById(id);
    if (!row) throw new PortalError(404, "NOT_FOUND", "ההזמנה לא נמצאה.");
    return json(await invitationCredentials(row, staff.id));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const staff = await requireStaff(),
      { id } = await params,
      input = await body(request);
    if (!uuid(id)) throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    const row = await invitationById(id);
    if (!row) throw new PortalError(404, "NOT_FOUND", "ההזמנה לא נמצאה.");
    const a = await getStore().appointment(row.appointment_id);
    if (!a || a.deletion_requested_at)
      throw new PortalError(410, "CARD_DELETING", "התיק אינו זמין.");
    if (["revoke", "delete", "replace"].includes(String(input.action))) {
      if (input.confirmed !== true || input.patientLabel !== a.patient_label)
        throw new PortalError(
          409,
          "CONFIRMATION_REQUIRED",
          "אשרו את הפעולה עבור המטופל הנבחר.",
        );
    }
    if (input.action === "replace") {
      const result = await issueInvitation(
        staff.id,
        { ...a, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() },
        row.language,
        true,
      );
      return json({
        ok: true,
        invitation_id: result.invitation.id,
        url: result.invitationUrl,
        code: result.code,
      });
    }
    if (["extend", "revoke", "delete"].includes(String(input.action))) {
      const expiry =
        typeof input.expires_at === "string" ? input.expires_at : null;
      if (
        input.action === "extend" &&
        (!expiry || !Number.isFinite(Date.parse(expiry)))
      )
        throw new PortalError(400, "INVALID_EXPIRY", "בחרו תאריך תפוגה תקין.");
      if (!(await manageInvitation(staff.id, id, String(input.action), expiry)))
        throw new PortalError(
          409,
          "INVITATION_CHANGED",
          "ההזמנה השתנתה. רעננו ונסו שוב.",
        );
      return json({ ok: true });
    }
    if (input.action === "resend") {
      if (
        input.confirmedRecipient !== true ||
        !uuid(input.request_id) ||
        typeof input.email !== "string" ||
        input.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      )
        throw new PortalError(
          400,
          "RECIPIENT_REQUIRED",
          "הזינו ואשרו את כתובת הדוא״ל של הנמען.",
        );
      const credentials = await invitationCredentials(row, staff.id),
        email = input.email.trim().toLowerCase();
      const attempt = await reserveSend(staff.id, id, input.request_id, email);
      if (attempt.status === "accepted")
        return json({ ok: true, status: "accepted", reused: true });
      const en = row.language === "en";
      const payload = {
        from: process.env.RESEND_FROM_EMAIL!,
        to: [email],
        subject: en
          ? "Your CardioAhead clinic invitation"
          : "ההזמנה האישית שלכם ל־CardioAhead",
        text: en
          ? "Prepare for your clinic visit with CardioAhead.\n\nOpen your personal link:\n" +
            credentials.url +
            "\n\nYour six-digit access code: " +
            credentials.code +
            "\n\nChoose Upload Documents or the guided Clalit desktop import. The clinic controls when this link expires. If this message is not intended for you, please ignore it."
          : "הכנה לביקור במרפאה באמצעות CardioAhead.\n\nפתחו את הקישור האישי:\n" +
            credentials.url +
            "\n\nקוד הגישה בן שש הספרות: " +
            credentials.code +
            "\n\nאפשר לבחור בהעלאת מסמכים או בייבוא המודרך מכללית במחשב. המרפאה קובעת את תוקף הקישור. אם ההודעה אינה מיועדת לכם, אפשר להתעלם ממנה.",
      };
      try {
        const provider = await sendStoredReportNotice(
          payload,
          "invitation-" + input.request_id,
        );
        await finishSend(staff.id, input.request_id, "accepted", provider);
        return json({ ok: true, status: "accepted", reused: false });
      } catch (error) {
        await finishSend(staff.id, input.request_id, "unknown", null);
        throw error;
      }
    }
    throw new PortalError(400, "BAD_ACTION", "בקשה לא תקינה.");
  } catch (error) {
    return failure(error);
  }
}
