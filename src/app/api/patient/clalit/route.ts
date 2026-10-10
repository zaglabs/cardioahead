import { invitationByHash } from "@/lib/invitations/store";
import {
  requirePatient,
  session,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
  randomToken,
  hash,
} from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { patientClalitEnabled } from "@/lib/medical-import/patient";

import {
  latestMedicalImport,
  createPatientImportGrant,
  cancelPatientImportGrants,
} from "@/lib/medical-import/store";

export async function GET(request: Request) {
  try {
    const a = await requirePatient();
    if (new URL(request.url).searchParams.get("appointment") !== a.id)
      throw new PortalError(
        409,
        "PATIENT_SESSION_CHANGED",
        "הכניסה השתנתה. הזינו שוב את קוד הגישה.",
      );
    const latest = await latestMedicalImport(a.id);
    const invitation = await invitationByHash(a.token_hash);
    const imported = latest?.invitation_id === invitation?.id ? latest : null;
    return json({
      enabled: patientClalitEnabled(),
      appointment_id: a.id,
      status: imported?.status || "not_started",
      record_count: imported?.bundle.records.length || 0,
      completed_at: imported?.completed_at || null,
      needs_reconnect:
        imported?.status === "failed" ||
        Boolean(
          imported?.status === "generating" &&
          Date.parse(imported.lease_until || "") <= Date.now(),
        ),
      download_url:
        process.env.CARDIOAHEAD_COLLECTOR_DOWNLOAD_URL ||
        "https://github.com/zaglabs/cardioahead/releases/download/collector-v0.2.0/CardioAhead-Collector-Windows.zip",
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await requirePatient(),
      current = await session("patient"),
      input = await body(request);
    if (!current || input.appointment_id !== a.id)
      throw new PortalError(
        409,
        "PATIENT_SESSION_CHANGED",
        "הכניסה השתנתה. הזינו שוב את קוד הגישה.",
      );
    if (input.action === "cancel") {
      await cancelPatientImportGrants(a.id, current.session_hash);
      return json({ ok: true });
    }
    if (!patientClalitEnabled())
      throw new PortalError(
        503,
        "CLALIT_PILOT_UNAVAILABLE",
        "הייבוא מכללית אינו זמין כרגע. אפשר להעלות מסמכים או לפנות למרפאה.",
      );
    if (
      input.action !== "connect" ||
      input.own_account !== true ||
      input.claude_consent !== true
    )
      throw new PortalError(
        400,
        "PATIENT_CONSENT_REQUIRED",
        "אשרו שהחשבון שייך לכם ואת עיבוד המידע ב־Claude.",
      );
    if ((await getStore().documents(a.id)).length)
      throw new PortalError(
        409,
        "SOURCE_METHOD_SELECTED",
        "כבר נשמרו קבצים להזמנה זו. לייבוא מכללית בקשו מהמרפאה הזמנה נפרדת.",
      );
    const token = randomToken(),
      grant = await createPatientImportGrant(current.session_hash, hash(token));
    return json(
      {
        connect_url:
          "http://127.0.0.1:3184/connect#token=" +
          encodeURIComponent(token) +
          "&lang=" +
          (input.language === "en" ? "en" : "he"),
        expires_at: grant.expires_at,
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
