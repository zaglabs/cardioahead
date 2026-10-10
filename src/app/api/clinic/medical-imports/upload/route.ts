import { invitationById } from "@/lib/invitations/store";
import { after } from "next/server";
import { body, json, failure, PortalError, hash } from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { isAdmin } from "@/lib/portal/staff-access";
import {
  getImportGrant,
  acceptMedicalImport,
  medicalImportById,
} from "@/lib/medical-import/store";
import { validateMedicalBundle } from "@/lib/medical-import/schema.mjs";
import {
  runMedicalSummary,
  personalClaudeConfigured,
} from "@/lib/medical-import/engine";
export const maxDuration = 300;
async function authorization(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{40,80})$/)?.[1];
  const grant = token ? await getImportGrant(hash(token)) : null;
  const owner = grant ? await getStore().staff(grant.owner_id) : null;
  const card = grant
    ? await getStore().appointment(grant.appointment_id)
    : null;
  const invitation =
    grant?.origin_kind === "patient" && grant.invitation_id
      ? await invitationById(grant.invitation_id)
      : null;
  const patient =
    grant?.origin_kind === "patient" && grant.patient_session_hash
      ? await getStore().session(grant.patient_session_hash)
      : null;
  if (
    !token ||
    !grant ||
    !owner ||
    !isAdmin(owner) ||
    Date.parse(grant.expires_at) <= Date.now() ||
    !card ||
    card.deletion_requested_at ||
    (grant.origin_kind === "patient"
      ? !invitation ||
        invitation.revoked_at ||
        invitation.deleted_at ||
        invitation.token_hash !== card.token_hash ||
        card.revoked_at ||
        Date.parse(card.expires_at) <= Date.now() ||
        card.intake_mode === "clinic" ||
        !grant.ai_consent ||
        !patient ||
        patient.kind !== "patient" ||
        patient.appointment_id !== card.id ||
        Date.parse(patient.expires_at) <= Date.now()
      : card.intake_mode !== "clinic" || card.created_by !== owner.id) ||
    (await getStore().documents(card.id)).length
  )
    throw new PortalError(
      401,
      "IMPORT_GRANT_INVALID",
      "קישור הייבוא האישי אינו זמין. התחברו מחדש מתוך התיק.",
    );
  return { token, grant, card };
}
export async function GET(request: Request) {
  try {
    const { grant, card } = await authorization(request);
    const imported = grant.import_id
      ? await medicalImportById(grant.import_id)
      : null;
    return json({
      provider: "clalit",
      subject_scope: "self",
      patient_label: card.patient_label,
      appointment_id: card.id,
      claude_consent: grant.ai_consent,
      expires_at: grant.expires_at,
      status: imported?.status || "awaiting_collection",
      error_code: imported?.error_code || null,
      configured: personalClaudeConfigured(),
      language:
        grant.origin_kind === "patient" && grant.invitation_id
          ? (await invitationById(grant.invitation_id))?.language || "he"
          : "en",
      origin_kind: grant.origin_kind || "personal",
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { token, grant } = await authorization(request);
    const input = await body(request, 2 * 1024 * 1024);
    let bundle;
    try {
      bundle = validateMedicalBundle(input);
    } catch (error) {
      throw new PortalError(
        400,
        error instanceof Error && error.message === "MEDICAL_SOURCE_LIMIT"
          ? "MEDICAL_SOURCE_LIMIT"
          : "INVALID_MEDICAL_BUNDLE",
        "המידע שנאסף אינו במבנה המותר לייבוא האישי.",
      );
    }
    // The fingerprint includes the explicit processing choice, so a later approval creates its own consent-bound version.
    const fingerprint = hash(
      JSON.stringify({
        provider: bundle.provider,
        records: bundle.records,
        coverage: bundle.coverage,
        claude_consent: grant.ai_consent,
        invitation_scope:
          grant.origin_kind === "patient" ? grant.invitation_id : null,
      }),
    );
    if (
      grant.origin_kind === "patient" &&
      !bundle.records.some((source) => source.association_verified)
    )
      throw new PortalError(
        400,
        "SOURCE_ASSOCIATION_REQUIRED",
        "נדרשת לפחות רשומה אחת עם הפניה מאומתת למקור בכללית.",
      );
    const imported = await acceptMedicalImport(
      hash(token),
      fingerprint,
      bundle,
    );
    // Full source text is passed in process memory only; persistent storage contains provenance/excerpts.
    if (grant.ai_consent && personalClaudeConfigured())
      after(() => runMedicalSummary(imported.id, imported.owner_id, bundle));
    return json(
      {
        ok: true,
        import_id: imported.id,
        appointment_id: imported.appointment_id,
        reused: imported.reused,
        record_count: bundle.records.length,
        queued: grant.ai_consent && personalClaudeConfigured(),
        original_documents_saved: false,
      },
      202,
    );
  } catch (error) {
    return failure(error);
  }
}
