import { after } from "next/server";
import {
  body,
  sameOrigin,
  json,
  failure,
  PortalError,
  hash,
} from "@/lib/portal/security";
import { visitStore } from "@/lib/visit/store";
import {
  visitAccess,
  uuid,
  emptySnapshot,
  makePreview,
  publicApproval,
  metadata,
} from "@/lib/visit/service";
import {
  documentVersion,
  scopedProviderConfigured,
} from "@/lib/evidence/input";

import {
  validateFindings,
  validateReport,
  validateLifestyle,
  emptyReport,
} from "@/lib/visit/content";
import { runPatientDraft } from "@/lib/visit/engine";
import { renderVisitPdf } from "@/lib/visit/pdf";
import {
  sendApprovedReport,
  reportsEmailConfigured,
  refreshDeliveryStatus,
} from "@/lib/visit/delivery";
import type {
  Approval,
  DraftJob,
  Findings,
  LifestyleContent,
  RecordVersion,
  ReportContent,
} from "@/lib/visit/types";
export const maxDuration = 300;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      { staff } = await visitAccess(id),
      store = visitStore(),
      state = await store.read(id),
      { version: current } = await documentVersion(id);
    const heads = {
      findings:
        state.versions.find((v) => v.id === state.workspace.findings_id) ||
        null,
      lifestyle:
        state.versions.find((v) => v.id === state.workspace.lifestyle_id) ||
        null,
      summary:
        state.versions.find((v) => v.id === state.workspace.summary_id) || null,
    };
    const selectedId = new URL(request.url).searchParams.get("version");
    const selected = selectedId
      ? await store.version(id, uuid(selectedId)!)
      : null;
    const candidates = state.jobs
      .filter(
        (j) =>
          j.status === "ready" &&
          j.regeneration_decision === "preserve" &&
          j.result_version_id,
      )
      .map((j) => state.versions.find((v) => v.id === j.result_version_id))
      .filter((v): v is RecordVersion =>
        Boolean(
          v &&
          v.id !== heads[v.kind as "lifestyle" | "summary"]?.id &&
          !heads[
            v.kind as "lifestyle" | "summary"
          ]?.source_snapshot.copied_from.includes(v.id),
        ),
      );
    const currentApproval =
      state.approvals.find((a) => a.id === state.workspace.approval_id) || null;
    return json({
      heads,
      selected,
      candidates,
      clinician: ["admin", "professor"].includes(staff.role),
      ai_configured: await scopedProviderConfigured(id),
      email_configured: reportsEmailConfigured(),
      document_version: current,
      current_approval: currentApproval
        ? publicApproval(currentApproval)
        : null,
      approvals: state.approvals.map(publicApproval),
      history: state.versions.map(metadata),
      deliveries: state.deliveries.map((d) => ({
        id: d.id,
        approval_id: d.approval_id,
        recipient: d.recipient,
        language: d.language,
        status: d.status,
        expires_at: d.expires_at,
        revoked_at: d.revoked_at,
        created_at: d.created_at,
        provider_event: d.provider_event,
        accepted_at: d.accepted_at,
        attempts: d.attempts,
        last_error: d.last_error,
      })),
      attempts: state.attempts,
      jobs: state.jobs.map(({ lease_until, ...j }) => ({
        ...j,
        can_retry:
          j.status === "failed" || Date.parse(lease_until) <= Date.now(),
      })),
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
      input = await body(request, 131072),
      action = typeof input.action === "string" ? input.action : "";
    const { staff, appointment } = await visitAccess(
      id,
      !["save_lifestyle", "generate_lifestyle"].includes(action),
    );
    const store = visitStore(),
      state = await store.read(id),
      { version: current, hasSources } = await documentVersion(id);
    const base = uuid(input.baseVersionId, true),
      findings =
        state.versions.find((v) => v.id === state.workspace.findings_id) ||
        null;
    if (["save_findings", "save_lifestyle", "save_summary"].includes(action)) {
      const kind = action.slice(5),
        sourceId = uuid(input.sourceVersionId, true);
      const source = sourceId
        ? await store.version(id, sourceId)
        : state.versions.find((v) => v.id === base) || null;
      if (source && source.kind !== kind)
        throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
      const data =
        kind === "findings"
          ? validateFindings(input.content)
          : kind === "lifestyle"
            ? validateLifestyle(
                input.content,
                source?.data as LifestyleContent | undefined,
              )
            : validateReport(input.content);
      const sources = source
        ? structuredClone(source.source_snapshot)
        : emptySnapshot(state.workspace.findings_id);
      if (sourceId && sourceId !== base)
        sources.copied_from = [...new Set([...sources.copied_from, sourceId])];
      const value = (await store.mutate(staff.id, id, action, {
        base_version_id: base,
        data,
        source_snapshot: sources,
        document_version: source?.document_version || current,
        origin: sourceId && sourceId !== base ? "copied" : "clinician",
      })) as RecordVersion;
      return json({ ok: true, version: value });
    }
    if (["generate_lifestyle", "generate_summary"].includes(action)) {
      if (!(await scopedProviderConfigured(id)))
        throw new PortalError(
          503,
          "AI_NOT_CONFIGURED",
          "עיבוד המסמכים באמצעות שירות AI ממתין לחיבור ולאישור.",
        );
      if (!hasSources)
        throw new PortalError(
          409,
          "NO_DOCUMENTS",
          "העלו מסמכי בדיקה לפני הכנת טיוטה בסיוע AI.",
        );
      const result = (await store.mutate(staff.id, id, action, {
        base_version_id: base,
        document_version: current,
        regeneration_decision:
          input.decision === "preserve"
            ? "preserve"
            : input.decision === "replace"
              ? "replace"
              : null,
      })) as { job: DraftJob; started: boolean };
      if (result.started) after(() => runPatientDraft(result.job));
      return json({ ok: true, job: result.job.id }, 202);
    }
    if (action === "include_lifestyle") {
      const source = await store.version(id, uuid(input.sourceVersionId)!);
      if (
        !source ||
        source.kind !== "lifestyle" ||
        !Array.isArray(input.sectionIds) ||
        !input.sectionIds.length
      )
        throw new PortalError(400, "BAD_REQUEST", "בחרו המלצות להכללה בסיכום.");
      const selected = (source.data as LifestyleContent).sections.filter(
        (s) =>
          input.sectionIds instanceof Array && input.sectionIds.includes(s.id),
      );
      if (selected.length !== input.sectionIds.length)
        throw new PortalError(400, "BAD_REQUEST", "בחרו המלצות להכללה בסיכום.");
      const head = state.versions.find(
        (v) => v.id === state.workspace.summary_id,
      );
      const report = head
        ? structuredClone(head.data as ReportContent)
        : emptyReport(
            appointment.patient_label,
            (findings?.data as Findings | undefined)?.visit_date || "",
          );
      for (const section of selected) {
        const copyId = source.id + ":" + section.id;
        if (!report.lifestyle.some((c) => c.id === copyId))
          report.lifestyle.push({
            id: copyId,
            source_version_id: source.id,
            title: section.title,
            text: section.patient_text,
          });
      }
      const sources = head
        ? structuredClone(head.source_snapshot)
        : emptySnapshot(state.workspace.findings_id);
      sources.copied_from = [...new Set([...sources.copied_from, source.id])];
      sources.retrieval = source.source_snapshot.retrieval;
      const value = await store.mutate(staff.id, id, "save_summary", {
        base_version_id: state.workspace.summary_id,
        data: validateReport(report),
        source_snapshot: sources,
        document_version: head?.document_version || source.document_version,
        origin: "copied",
      });
      return json({ ok: true, version: value });
    }
    if (action === "preview") {
      return json(
        await makePreview(
          id,
          uuid(input.versionId)!,
          input.language === "en" ? "en" : "he",
          input.recipient,
        ),
      );
    }
    if (action === "approve") {
      if (input.reviewed !== true)
        throw new PortalError(
          400,
          "REVIEW_REQUIRED",
          "יש לאשר שעיינתם בתוכן המדויק ובכתובת הנמען.",
        );
      const preview = await makePreview(
        id,
        uuid(input.versionId)!,
        input.language === "en" ? "en" : "he",
        input.recipient,
      );
      if (input.previewHash !== preview.hash)
        throw new PortalError(
          409,
          "PREVIEW_CHANGED",
          "הגרסה או הנמען השתנו. פתחו תצוגה מקדימה חדשה.",
        );
      if (preview.outdated && input.acknowledgeChanges !== true)
        throw new PortalError(
          409,
          "SOURCE_CHANGED",
          "יש לעיין בשינויים במסמכים או בממצאי הביקור לפני אישור.",
        );
      const otherRecipient = state.deliveries.filter(
        (d) => !d.revoked_at && d.recipient !== preview.recipient,
      );
      if (otherRecipient.length && input.revokeOtherRecipients !== true)
        throw new PortalError(
          409,
          "RECIPIENT_CHANGED",
          "אשרו את ביטול הקישורים הקודמים בעת שינוי כתובת הנמען.",
        );
      for (const d of otherRecipient)
        await store.mutate(staff.id, id, "revoke", { delivery_id: d.id });
      const bytes = await renderVisitPdf(preview.snapshot);
      const approval = (await store.mutate(staff.id, id, "approve", {
        version_id: preview.version.id,
        reviewed: true,
        language: preview.snapshot.language,
        recipient: preview.recipient,
        content_hash: preview.hash,
        snapshot: preview.snapshot,
        pdf_base64: bytes.toString("base64"),
        pdf_sha256: hash(bytes),
      })) as Approval;
      return json({ ok: true, approval: publicApproval(approval) });
    }
    if (action === "send" || action === "reissue") {
      if (input.confirmed !== true)
        throw new PortalError(
          400,
          "SEND_CONFIRMATION",
          "אשרו את כתובת הנמען לפני שליחת ההודעה.",
        );
      const approval = await store.approval(uuid(input.approvalId)!);
      if (!approval || approval.appointment_id !== id)
        throw new PortalError(
          409,
          "APPROVAL_REQUIRED",
          "הדוח טרם אושר לשליחה.",
        );
      const source = await store.version(id, approval.version_id);
      if (
        source &&
        (source.document_version !== current ||
          source.source_snapshot.findings_version_id !==
            state.workspace.findings_id) &&
        input.acknowledgeChanges !== true
      )
        throw new PortalError(
          409,
          "SOURCE_CHANGED",
          "יש לעיין בשינויים במסמכים או בממצאי הביקור לפני שליחה.",
        );
      const result = await sendApprovedReport(
        staff.id,
        id,
        approval,
        typeof input.recipient === "string"
          ? input.recipient.trim().toLowerCase()
          : "",
        action === "reissue",
        action === "reissue" ? uuid(input.deliveryId)! : undefined,
      );
      return json(
        {
          ok: true,
          status: result.delivery.status,
          reused: result.reused,
          delivery_id: result.delivery.id,
        },
        result.delivery.status === "sending" ? 202 : 200,
      );
    }
    if (action === "revoke" || action === "delivery_status") {
      const delivery = state.deliveries.find(
        (d) => d.id === uuid(input.deliveryId),
      );
      if (!delivery)
        throw new PortalError(404, "NOT_FOUND", "המסירה לא נמצאה.");
      if (action === "revoke")
        await store.mutate(staff.id, id, "revoke", {
          delivery_id: delivery.id,
        });
      else await refreshDeliveryStatus(delivery);
      return json({ ok: true });
    }
    throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
  } catch (e) {
    if (
      e instanceof Error &&
      ["INVALID_REPORT_CONTENT", "INVALID_RECIPIENT"].includes(e.message)
    )
      return failure(
        new PortalError(
          400,
          "INVALID_REPORT_CONTENT",
          "בדקו את התוכן ואת כתובת הדוא״ל שהזנתם.",
        ),
      );
    return failure(e);
  }
}
