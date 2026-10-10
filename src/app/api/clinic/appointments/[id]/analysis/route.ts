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
import { clinicalStore } from "@/lib/clinical/store";
import { resolveVisualFinding } from "@/lib/clinical/presentation-focus";
import { analysisConfigured, runAnalysis } from "@/lib/clinical/engine";
export const maxDuration = 300;
async function appointment(id: string) {
  const a = await getStore().appointment(id);
  if (!a) throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
  return a;
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff();
    const { id } = await params;
    await appointment(id);
    const record = await clinicalStore().get(id),
      presentation = await clinicalStore().presentation(id);
    const analysis = record
      ? {
          appointment_id: record.appointment_id,
          status: record.status,
          sources: record.sources,
          summary: record.summary,
          model: record.model,
          attempts: record.attempts,
          error_code: record.error_code,
          created_at: record.created_at,
          completed_at: record.completed_at,
          reviewed_at: record.reviewed_at,
          reviewed_by: record.reviewed_by,
        }
      : null;
    return json({
      analysis,
      presentation,
      configured: analysisConfigured(),
      can_resume: Boolean(
        record &&
        record.status === "generating" &&
        record.lease_until &&
        Date.parse(record.lease_until) < Date.now() &&
        record.attempts < 3,
      ),
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
    const staff = await requireStaff();
    const { id } = await params;
    const a = await appointment(id);
    const input = await body(request),
      action = input.action || "start";
    const db = clinicalStore();
    if (action === "start") {
      if (a.status === "invited")
        throw new PortalError(
          409,
          "NOT_SUBMITTED",
          "הסיכום יוכן לאחר שהמטופל ישלח את המסמכים למרפאה.",
        );
      if (!analysisConfigured())
        throw new PortalError(
          503,
          "AI_NOT_CONFIGURED",
          "עיבוד המסמכים באמצעות שירות AI ממתין לחיבור ולאישור.",
        );
      await db.queue(id);
      after(() => runAnalysis(id));
      return json({ ok: true }, 202);
    }
    if (staff.role !== "admin" && staff.role !== "professor")
      throw new PortalError(
        403,
        "CLINICIAN_REQUIRED",
        "יצירת הסבר חזותי ואישור תוכן זמינים לרופא או למנהל בלבד.",
      );
    if (action === "create_presentation") {
      const existing = await db.presentation(id);
      if (existing)
        return json({ ok: true, presentation: existing, reused: true });
      const analysis = await db.get(id);
      if (
        analysis?.status !== "ready" ||
        !analysis.summary?.presentation.eligible ||
        !analysis.summary.presentation.slides.some((slide) =>
          resolveVisualFinding(slide, analysis.sources),
        )
      )
        throw new PortalError(
          409,
          "NO_PROPOSAL",
          "אין עדיין הצעה מתאימה להסבר חזותי המבוססת על המסמכים.",
        );
      const saved = await db.savePresentation(id, staff.id, {
        renderer_version: 1,
        title: { he: "הסבר לקראת הפגישה", en: "Your visit, explained" },
        slides: analysis.summary.presentation.slides,
        sources: analysis.sources,
      });
      return json(
        { ok: true, presentation: saved.record, reused: saved.reused },
        saved.reused ? 200 : 201,
      );
    }
    if (action === "review_summary" || action === "review_presentation") {
      if (
        !(await db.review(
          id,
          staff.id,
          action === "review_summary" ? "summary" : "presentation",
        ))
      )
        throw new PortalError(
          409,
          "NOT_READY",
          "התוכן עדיין אינו מוכן לאישור.",
        );
      return json({ ok: true });
    }
    throw new PortalError(400, "BAD_ACTION", "בקשה לא תקינה.");
  } catch (e) {
    return failure(e);
  }
}
