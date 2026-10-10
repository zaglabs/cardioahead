import {
  requireStaff,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
  hash,
  randomToken,
} from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { isAdmin } from "@/lib/portal/staff-access";
import {
  latestMedicalImport,
  createImportGrant,
  reviewMedicalImport,
  saveMedicalVisual,
} from "@/lib/medical-import/store";
import { personalClaudeConfigured } from "@/lib/medical-import/engine";
import { medicalVisualFocus } from "@/lib/medical-import/visual";
export const maxDuration = 300;
async function card(id: string) {
  const value = await getStore().appointment(id);
  if (!value) throw new PortalError(404, "NOT_FOUND", "התיק לא נמצא.");
  if (value.deletion_requested_at)
    throw new PortalError(410, "CARD_DELETING", "התיק נמצא בתהליך מחיקה.");
  return value;
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff();
    const { id } = await params;
    await card(id);
    const row = await latestMedicalImport(id);
    if (!row)
      return json({ record: null, configured: personalClaudeConfigured() });
    const { lease_token, lease_until, ...record } = row;
    void lease_token;
    void lease_until;
    return json({
      record,
      configured: personalClaudeConfigured(),
      needs_recollection:
        row.status === "failed" ||
        (row.status === "generating" &&
          Date.parse(row.lease_until || "") < Date.now()),
    });
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
    const staff = await requireStaff();
    const { id } = await params;
    const appointment = await card(id);
    const input = await body(request);
    const action = input.action;
    if (action === "connect") {
      if (!isAdmin(staff))
        throw new PortalError(
          403,
          "OWNER_REQUIRED",
          "הבדיקה האישית זמינה למנהל המערכת בלבד.",
        );
      if (
        input.subject_scope !== "self" ||
        typeof input.claude_consent !== "boolean" ||
        appointment.intake_mode !== "clinic" ||
        appointment.created_by !== staff.id ||
        (await getStore().documents(id)).length
      )
        throw new PortalError(
          409,
          "PERSONAL_CARD_REQUIRED",
          "יש לפתוח תיק אישי נפרד במרפאה ולהצהיר שהמידע שייך לכם.",
        );
      const token = randomToken();
      const grant = await createImportGrant(
        id,
        staff.id,
        hash(token),
        input.claude_consent,
      );
      return json(
        {
          connect_url:
            "http://127.0.0.1:3184/connect#token=" + encodeURIComponent(token),
          expires_at: grant.expires_at,
        },
        201,
      );
    }
    if (staff.role !== "admin" && staff.role !== "professor")
      throw new PortalError(
        403,
        "CLINICIAN_REQUIRED",
        "סקירת המקורות והסבר חזותי זמינים לרופא או למנהל בלבד.",
      );
    const record = await latestMedicalImport(id);
    if (!record)
      throw new PortalError(
        404,
        "IMPORT_NOT_FOUND",
        "אין עדיין ייבוא לתיק זה.",
      );
    if (action === "review") {
      if (!(await reviewMedicalImport(record.id, staff.id, null, true)))
        throw new PortalError(
          409,
          "NOT_READY",
          "הסיכום עדיין אינו מוכן לסקירה.",
        );
      return json({ ok: true });
    }
    if (action === "include_source") {
      if (
        typeof input.record_id !== "string" ||
        !record.bundle.records.some((source) => source.id === input.record_id)
      )
        throw new PortalError(
          400,
          "INVALID_SOURCE",
          "המקור לא נמצא בייבוא זה.",
        );
      if (
        !(await reviewMedicalImport(record.id, staff.id, input.record_id, true))
      )
        throw new PortalError(409, "REVIEW_FAILED", "המקור לא סומן לעיון.");
      return json({ ok: true });
    }
    if (action === "create_visual") {
      if (record.visual) return json({ content: record.visual, reused: true });
      const slides =
        record.summary?.visual_proposal.slides.filter((slide) =>
          medicalVisualFocus(slide, record.bundle),
        ) || [];
      if (
        record.status !== "ready" ||
        !record.summary?.visual_proposal.eligible ||
        !slides.length
      )
        throw new PortalError(
          409,
          "NO_PROPOSAL",
          "אין עדיין ממצא מתועד המספיק להסבר חזותי נתמך.",
        );
      const saved = await saveMedicalVisual(record.id, staff.id, slides);
      return json(saved, saved.reused ? 200 : 201);
    }
    throw new PortalError(400, "BAD_ACTION", "בקשה לא תקינה.");
  } catch (error) {
    return failure(error);
  }
}
