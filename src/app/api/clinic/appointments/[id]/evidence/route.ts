import { after } from "next/server";
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
  documentVersion,
  scopedProviderConfigured,
} from "@/lib/evidence/input";
import { evidenceStore } from "@/lib/evidence/store";
import { runEvidenceReview } from "@/lib/evidence/engine";
export const maxDuration = 300;
async function access(id: string) {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "professor")
    throw new PortalError(
      403,
      "CLINICIAN_REQUIRED",
      "סקירת ראיות זמינה לרופא או למנהל בלבד.",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
  const a = await getStore().appointment(id);
  if (!a) throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
  if (a.deletion_requested_at)
    throw new PortalError(
      410,
      "CARD_DELETING",
      "התיק נמצא בתהליך מחיקה ואינו זמין לגישה.",
    );
  return staff;
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await access(id);
    const { version } = await documentVersion(id),
      records = await evidenceStore().list(id);
    return json({
      configured: await scopedProviderConfigured(id),
      document_version: version,
      review: (() => {
        const selected = new URL(request.url).searchParams.get("review");
        const r = selected
          ? records.find((r) => r.id === selected)
          : records[0];
        if (!r) return null;
        const { lease_until, ...publicRecord } = r;
        return {
          ...publicRecord,
          outdated: r.document_version !== version,
          can_retry:
            r.status === "failed" ||
            (r.status === "processing" &&
              Date.parse(lease_until) <= Date.now()),
        };
      })(),
      history: records.map((r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        completed_at: r.completed_at,
        document_version: r.document_version,
      })),
      latest_id: records[0]?.id || null,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { id } = await params,
      staff = await access(id),
      input = await body(request);
    if (
      typeof input.action !== "string" ||
      !["generate", "regenerate", "retry"].includes(input.action)
    )
      throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    if (!(await scopedProviderConfigured(id)))
      throw new PortalError(
        503,
        "AI_NOT_CONFIGURED",
        "עיבוד המסמכים באמצעות שירות AI ממתין לחיבור ולאישור.",
      );
    const question =
      typeof input.question === "string" ? input.question.trim() : "";
    if (question.length > 2000)
      throw new PortalError(400, "BAD_REQUEST", "בדקו את הפרטים שהזנתם.");
    const kind =
        input.questionKind === "plan" && question ? "plan" : "question",
      { hasSources, version } = await documentVersion(id);
    if (!hasSources)
      throw new PortalError(
        409,
        "NO_DOCUMENTS",
        "העלו מסמכים לפני יצירת סקירת ראיות.",
      );
    const store = evidenceStore();
    const { record, started } = await store.queue(
      id,
      staff.id,
      version,
      question,
      kind,
      input.action !== "generate",
    );
    if (started) after(() => runEvidenceReview(record));
    return json(
      { ok: true, id: record.id, reused: record.status === "ready" },
      record.status === "ready" ? 200 : 202,
    );
  } catch (e) {
    return failure(e);
  }
}
