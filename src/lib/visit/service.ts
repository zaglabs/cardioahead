import "server-only";
import { hash, requireStaff, PortalError } from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { visitStore } from "./store";
import { documentVersion } from "@/lib/evidence/input";
import {
  localizedReport,
  normalizeRecipient,
  validateReport,
  approvalReady,
} from "./content";
import type {
  Approval,
  RecordVersion,
  ReportContent,
  SourceSnapshot,
} from "./types";
export function uuid(value: unknown, optional = false) {
  if (optional && (value === null || value === undefined || value === ""))
    return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
  return value;
}
export async function visitAccess(id: string, clinician = false) {
  const staff = await requireStaff();
  uuid(id);
  if (clinician && !["admin", "professor"].includes(staff.role))
    throw new PortalError(
      403,
      "CLINICIAN_REQUIRED",
      "עריכת ממצאי ביקור, אישור ושליחת דוחות זמינים לרופא או למנהל בלבד.",
    );
  const appointment = await getStore().appointment(id);
  if (!appointment) throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
  if (appointment.deletion_requested_at)
    throw new PortalError(
      410,
      "CARD_DELETING",
      "התיק נמצא בתהליך מחיקה ואינו זמין לגישה.",
    );
  return { staff, appointment };
}
export const emptySnapshot = (findings: string | null): SourceSnapshot => ({
  documents: [],
  facts: [],
  retrieval: null,
  findings_version_id: findings,
  copied_from: [],
  notes: [],
});
export function reportHash(snapshot: unknown, recipient: string) {
  return hash(JSON.stringify({ snapshot, recipient }));
}
export async function makePreview(
  pid: string,
  versionId: string,
  language: "he" | "en",
  recipientValue: unknown,
) {
  const state = await visitStore().read(pid),
    version = await visitStore().version(pid, versionId);
  if (
    !version ||
    version.kind !== "summary" ||
    state.workspace.summary_id !== version.id
  )
    throw new PortalError(
      409,
      "PREVIEW_CHANGED",
      "רעננו את הטיוטה לפני תצוגה או אישור.",
    );
  const content = localizedReport(
      validateReport(version.data as ReportContent),
      language,
    ),
    recipient = normalizeRecipient(recipientValue);
  if (!approvalReady(content))
    throw new PortalError(
      400,
      "REPORT_INCOMPLETE",
      "השלימו שם מטופל, תאריך ביקור, שם רופא, פרטי מרפאה, תוכן והצעדים הבאים לפני אישור.",
    );
  const { version: current } = await documentVersion(pid);
  return {
    version,
    snapshot: content,
    recipient,
    hash: reportHash(content, recipient),
    outdated:
      version.document_version !== current ||
      version.source_snapshot.findings_version_id !==
        state.workspace.findings_id,
    current_document_version: current,
  };
}
export function publicApproval(a: Approval) {
  const { pdf_base64, ...info } = a;
  void pdf_base64;
  return info;
}
export function metadata(v: RecordVersion) {
  return {
    id: v.id,
    kind: v.kind,
    revision: v.revision,
    origin: v.origin,
    created_at: v.created_at,
    author_identity: v.author_identity,
    document_version: v.document_version,
  };
}
