import "server-only";
import { randomUUID } from "node:crypto";
import { localTestMode } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { supabaseAdmin } from "@/lib/portal/store";
import { PortalError } from "@/lib/portal/security";
import type {
  Approval,
  Delivery,
  DraftJob,
  RecordVersion,
  ReportChallenge,
  ReportSession,
  SendAttempt,
  VisitWorkspace,
} from "./types";
type Payload = Record<string, unknown>;
function error(code: string): never {
  const messages: Record<string, string> = {
    "draft changed": "הטיוטה השתנתה. רעננו לפני שמירה.",
    "send in progress": "השליחה מתבצעת כעת. אפשר לערוך לאחר סיומה.",
    "draft generation in progress":
      "הכנת הטיוטה מתבצעת כעת. המתינו לסיום לפני אישור או שליחה.",
    "regeneration confirmation required":
      "בחרו אם לשמור את הטיוטה הקיימת לפני יצירה מחדש.",
    "current reviewed draft required": "יש לעיין ולאשר את גרסת הטיוטה הנוכחית.",
    "current approved report required":
      "ניתן לשלוח רק את גרסת הדוח הנוכחית שאושרה, לנמען שאושר.",
    "recipient mismatch": "כתובת הנמען אינה תואמת לאישור.",
    "reissue required":
      "יש להנפיק קישור חדש. לא ניתן לחזור על ניסיון שליחה זה בבטחה.",
  };
  throw new PortalError(
    409,
    "VISIT_CONFLICT",
    messages[code] || "עדכון הרשומה לא הושלם. רעננו ונסו שוב.",
  );
}
function checked<T>(r: { data: T; error: unknown }) {
  if (r.error) {
    const message = (r.error as { message?: string }).message || "";
    for (const key of [
      "draft changed",
      "send in progress",
      "draft generation in progress",
      "regeneration confirmation required",
      "current reviewed draft required",
      "current approved report required",
      "recipient mismatch",
      "reissue required",
    ])
      if (message.includes(key)) error(key);
    throw new PortalError(
      503,
      "VISIT_STORAGE",
      "יש להחיל את עדכון מסד הנתונים לסיכומי ביקור ולשליחת דוחות.",
    );
  }
  return r.data;
}
const headKey = (
  kind: string,
): "findings_id" | "lifestyle_id" | "summary_id" =>
  kind === "findings"
    ? "findings_id"
    : kind === "lifestyle"
      ? "lifestyle_id"
      : "summary_id";
export function visitStore() {
  if (localTestMode())
    return {
      read: (pid: string) =>
        localTransaction((s) => ({
          workspace: s.visitWorkspaces.find(
            (w) => w.appointment_id === pid,
          ) || {
            appointment_id: pid,
            findings_id: null,
            lifestyle_id: null,
            summary_id: null,
            approval_id: null,
          },
          versions: s.recordVersions
            .filter((v) => v.appointment_id === pid)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
          approvals: s.reportApprovals.filter((v) => v.appointment_id === pid),
          deliveries: s.reportDeliveries.filter(
            (v) => v.appointment_id === pid,
          ),
          attempts: s.reportAttempts.filter((v) =>
            s.reportDeliveries.some(
              (d) => d.id === v.delivery_id && d.appointment_id === pid,
            ),
          ),
          jobs: s.patientDraftJobs
            .filter((v) => v.appointment_id === pid)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        })),
      version: (pid: string, id: string) =>
        localTransaction(
          (s) =>
            s.recordVersions.find(
              (v) => v.id === id && v.appointment_id === pid,
            ) || null,
        ),
      approval: (id: string) =>
        localTransaction(
          (s) => s.reportApprovals.find((v) => v.id === id) || null,
        ),
      delivery: (tokenHash: string) =>
        localTransaction(
          (s) =>
            s.reportDeliveries.find((v) => v.token_hash === tokenHash) || null,
        ),
      mutate: (actorId: string, pid: string, action: string, p: Payload) =>
        localTransaction((s) => {
          const actor = s.staff.find(
            (v) => v.id === actorId && v.status === "active",
          );
          if (!actor) throw new Error("STAFF_REQUIRED");
          if (
            !["save_lifestyle", "generate_lifestyle"].includes(action) &&
            !["admin", "professor"].includes(actor.role)
          )
            throw new PortalError(
              403,
              "CLINICIAN_REQUIRED",
              "עריכת ממצאי ביקור, אישור ושליחת דוחות זמינים לרופא או למנהל בלבד.",
            );
          if (
            !s.appointments.some(
              (v) => v.id === pid && !v.deletion_requested_at,
            )
          )
            throw new Error("CARD_UNAVAILABLE");
          let w = s.visitWorkspaces.find((v) => v.appointment_id === pid);
          if (!w) {
            w = {
              appointment_id: pid,
              findings_id: null,
              lifestyle_id: null,
              summary_id: null,
              approval_id: null,
            };
            s.visitWorkspaces.push(w);
          }
          const activeSend = () =>
            s.reportDeliveries.some(
              (d) =>
                d.appointment_id === pid &&
                d.status === "sending" &&
                Date.parse(d.lease_until || "") > Date.now(),
            );
          const activeGeneration = () =>
            s.patientDraftJobs.some(
              (j) =>
                j.appointment_id === pid &&
                j.kind === "summary" &&
                j.status === "processing" &&
                Date.parse(j.lease_until) > Date.now(),
            );
          const audit = (event: string, details: Record<string, unknown>) =>
            s.audit.push({
              event,
              actor_id: actor.id,
              appointment_id: pid,
              details,
              at: new Date().toISOString(),
            });
          if (
            [
              "save_findings",
              "save_lifestyle",
              "save_summary",
              "generate_lifestyle",
              "generate_summary",
            ].includes(action)
          ) {
            const kind = action.endsWith("findings")
                ? "findings"
                : action.endsWith("lifestyle")
                  ? "lifestyle"
                  : "summary",
              key = headKey(kind),
              head = w[key];
            if (head !== (p.base_version_id || null)) error("draft changed");
            if (kind === "summary" && activeSend()) error("send in progress");
            if (action.startsWith("generate_")) {
              if (
                head &&
                !["preserve", "replace"].includes(
                  String(p.regeneration_decision || ""),
                )
              )
                error("regeneration confirmation required");
              for (const j of s.patientDraftJobs)
                if (
                  j.appointment_id === pid &&
                  j.kind === kind &&
                  j.status === "processing" &&
                  Date.parse(j.lease_until) <= Date.now()
                )
                  Object.assign(j, {
                    status: "failed",
                    stage: "failed",
                    error_code: "JOB_EXPIRED",
                  });
              const running = s.patientDraftJobs.find(
                (j) =>
                  j.appointment_id === pid &&
                  j.kind === kind &&
                  j.status === "processing",
              );
              if (running) return { job: running, started: false };
              const j: DraftJob = {
                id: randomUUID(),
                appointment_id: pid,
                kind: kind as "lifestyle" | "summary",
                created_by: actor.id,
                base_version_id: head,
                findings_version_id: w.findings_id,
                document_version: String(p.document_version),
                regeneration_decision:
                  typeof p.regeneration_decision === "string"
                    ? p.regeneration_decision
                    : null,
                result_version_id: null,
                status: "processing",
                stage: "analysing",
                lease_until: new Date(Date.now() + 300000).toISOString(),
                error_code: null,
                created_at: new Date().toISOString(),
                completed_at: null,
              };
              s.patientDraftJobs.push(j);
              audit("patient_draft_generation_requested", {
                job_id: j.id,
                kind,
              });
              return { job: j, started: true };
            }
            const v = {
              id: randomUUID(),
              appointment_id: pid,
              kind,
              revision:
                1 +
                Math.max(
                  0,
                  ...s.recordVersions
                    .filter((v) => v.appointment_id === pid && v.kind === kind)
                    .map((v) => v.revision),
                ),
              data: p.data,
              source_snapshot: p.source_snapshot,
              document_version: p.document_version,
              origin: p.origin || "clinician",
              created_by: actor.id,
              author_identity: { email: actor.email, role: actor.role },
              created_at: new Date().toISOString(),
            } as RecordVersion;
            s.recordVersions.push(v);
            w[key] = v.id;
            if (kind === "summary") w.approval_id = null;
            audit("patient_draft_saved", {
              version_id: v.id,
              kind,
              revision: v.revision,
            });
            return v;
          }
          if (action === "approve") {
            const v = s.recordVersions.find(
              (v) =>
                v.id === p.version_id &&
                v.appointment_id === pid &&
                v.kind === "summary",
            );
            if (!v || w.summary_id !== v.id || p.reviewed !== true)
              error("current reviewed draft required");
            if (activeSend()) error("send in progress");
            if (activeGeneration()) error("draft generation in progress");
            const existing = s.reportApprovals.find(
              (a) =>
                a.id === w.approval_id &&
                a.version_id === v.id &&
                a.content_hash === p.content_hash &&
                a.recipient === p.recipient,
            );
            if (existing) return existing;
            const a = {
              id: randomUUID(),
              appointment_id: pid,
              version_id: v.id,
              language: p.language,
              recipient: p.recipient,
              content_hash: p.content_hash,
              snapshot: p.snapshot,
              pdf_base64: p.pdf_base64,
              pdf_sha256: p.pdf_sha256,
              approved_by: actor.id,
              approver_identity: { email: actor.email, role: actor.role },
              approved_at: new Date().toISOString(),
            } as Approval;
            s.reportApprovals.push(a);
            w.approval_id = a.id;
            audit("patient_report_approved", {
              approval_id: a.id,
              version_id: v.id,
            });
            return a;
          }
          if (action === "claim_send") {
            const ap = s.reportApprovals.find(
              (a) => a.id === p.approval_id && a.appointment_id === pid,
            );
            if (
              !ap ||
              w.approval_id !== ap.id ||
              w.summary_id !== ap.version_id ||
              ap.recipient !== p.confirmed_recipient ||
              ap.content_hash !== p.content_hash
            )
              error("current approved report required");
            if (activeGeneration()) error("draft generation in progress");
            const notice = p.notice_payload as Delivery["notice_payload"];
            if (
              !notice ||
              JSON.stringify(notice.to) !== JSON.stringify([ap.recipient])
            )
              error("recipient mismatch");
            let d = s.reportDeliveries.find(
              (d) => d.approval_id === ap.id && !d.revoked_at,
            );
            if (p.reissue === true) {
              const old = s.reportDeliveries.find(
                (v) =>
                  v.id === p.expected_delivery_id && v.approval_id === ap.id,
              );
              if (!old) error("reissue required");
              if (d && d.id !== old.id) return { delivery: d, send: false };
              if (
                d &&
                d.status === "sending" &&
                Date.parse(d.lease_until || "") > Date.now()
              )
                return { delivery: d, send: false };
              if (
                !d &&
                s.reportDeliveries.some(
                  (v) =>
                    v.approval_id === ap.id &&
                    Date.parse(v.created_at) > Date.parse(old.created_at),
                )
              )
                error("reissue required");
            }
            if (d && p.reissue === true) {
              d.revoked_at = new Date().toISOString();
              s.reportSessions = s.reportSessions.filter(
                (v) => v.delivery_id !== d!.id,
              );
              d = undefined;
            } else if (d) {
              if (
                ["accepted", "delivered"].includes(d.status) ||
                (d.status === "sending" &&
                  Date.parse(d.lease_until || "") > Date.now())
              )
                return { delivery: d, send: false };
              if (
                Date.parse(d.created_at) < Date.now() - 23 * 3600000 ||
                Date.parse(d.expires_at) <= Date.now() ||
                d.status === "bounced"
              )
                error("reissue required");
              Object.assign(d, {
                status: "sending",
                lease_until: new Date(Date.now() + 60000).toISOString(),
                active_attempt_id: p.attempt_id,
                attempts: d.attempts + 1,
                last_error: null,
              });
            } else if (
              p.reissue !== true &&
              s.reportDeliveries.some((v) => v.approval_id === ap.id)
            )
              error("reissue required");
            if (!d) {
              d = {
                id: String(p.delivery_id),
                appointment_id: pid,
                approval_id: ap.id,
                recipient: ap.recipient,
                language: ap.language,
                status: "sending",
                token_hash: String(p.token_hash),
                token_encrypted: String(p.token_encrypted),
                expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
                revoked_at: null,
                created_at: new Date().toISOString(),
                lease_until: new Date(Date.now() + 60000).toISOString(),
                active_attempt_id: String(p.attempt_id),
                provider_id: null,
                provider_event: null,
                accepted_at: null,
                attempts: 1,
                notice_payload: notice,
                last_error: null,
              };
              s.reportDeliveries.push(d);
            }
            s.reportAttempts.push({
              id: String(p.attempt_id),
              delivery_id: d.id,
              actor_id: actor.id,
              started_at: new Date().toISOString(),
              finished_at: null,
              status: "sending",
              provider_id: null,
            });
            audit("patient_report_send_requested", {
              approval_id: ap.id,
              delivery_id: d.id,
            });
            return { delivery: d, send: true };
          }
          if (action === "revoke") {
            const d = s.reportDeliveries.find(
              (d) => d.id === p.delivery_id && d.appointment_id === pid,
            );
            if (!d) throw new Error("DELIVERY_UNAVAILABLE");
            d.revoked_at ||= new Date().toISOString();
            s.reportSessions = s.reportSessions.filter(
              (v) => v.delivery_id !== d.id,
            );
            audit("patient_report_link_revoked", { delivery_id: d.id });
            return d;
          }
          throw new Error("UNKNOWN_VISIT_ACTION");
        }),
      updateJob: (id: string, patch: Partial<DraftJob>) =>
        localTransaction((s) => {
          const j = s.patientDraftJobs.find(
            (j) =>
              j.id === id &&
              j.status === "processing" &&
              Date.parse(j.lease_until) > Date.now(),
          );
          if (!j) return false;
          Object.assign(j, patch);
          return true;
        }),
      finishDraft: (
        id: string,
        data: RecordVersion["data"],
        sources: RecordVersion["source_snapshot"],
      ) =>
        localTransaction((s) => {
          const j = s.patientDraftJobs.find(
            (j) =>
              j.id === id &&
              j.status === "processing" &&
              Date.parse(j.lease_until) > Date.now(),
          );
          if (!j) return null;
          const w = s.visitWorkspaces.find(
              (w) => w.appointment_id === j.appointment_id,
            ),
            actor = s.staff.find(
              (a) => a.id === j.created_by && a.status === "active",
            );
          if (
            !w ||
            !s.appointments.some(
              (a) => a.id === j.appointment_id && !a.deletion_requested_at,
            )
          )
            return null;
          const key = headKey(j.kind);
          if (
            w[key] !== j.base_version_id ||
            w.findings_id !== j.findings_version_id
          ) {
            Object.assign(j, {
              status: "failed",
              stage: "failed",
              error_code: "DRAFT_CHANGED",
            });
            return null;
          }
          if (
            !actor ||
            (j.kind === "summary" &&
              !["admin", "professor"].includes(actor.role))
          ) {
            Object.assign(j, {
              status: "failed",
              stage: "failed",
              error_code: "ACCESS_CHANGED",
            });
            return null;
          }
          if (
            j.kind === "summary" &&
            s.reportDeliveries.some(
              (d) =>
                d.appointment_id === j.appointment_id &&
                d.status === "sending" &&
                Date.parse(d.lease_until || "") > Date.now(),
            )
          ) {
            Object.assign(j, {
              status: "failed",
              stage: "failed",
              error_code: "SEND_IN_PROGRESS",
            });
            return null;
          }
          const v: RecordVersion = {
            id: randomUUID(),
            appointment_id: j.appointment_id,
            kind: j.kind,
            revision:
              1 +
              Math.max(
                0,
                ...s.recordVersions
                  .filter(
                    (v) =>
                      v.appointment_id === j.appointment_id &&
                      v.kind === j.kind,
                  )
                  .map((v) => v.revision),
              ),
            data,
            source_snapshot: sources,
            document_version: j.document_version,
            origin: "ai",
            created_by: actor.id,
            author_identity: { email: actor.email, role: actor.role },
            created_at: new Date().toISOString(),
          };
          s.recordVersions.push(v);
          if (j.regeneration_decision !== "preserve" || !j.base_version_id) {
            w[key] = v.id;
            if (j.kind === "summary") w.approval_id = null;
          }
          Object.assign(j, {
            status: "ready",
            stage: "complete",
            completed_at: new Date().toISOString(),
            result_version_id: v.id,
          });
          s.audit.push({
            event: "patient_draft_generated",
            actor_id: actor.id,
            appointment_id: j.appointment_id,
            details: { version_id: v.id, job_id: j.id },
            at: v.created_at,
          });
          return v;
        }),
      finishSend: (
        id: string,
        attempt: string,
        status: "accepted" | "failed" | "unknown",
        provider: string | null,
        code: string | null,
      ) =>
        localTransaction((s) => {
          const d = s.reportDeliveries.find(
            (d) =>
              d.id === id &&
              d.active_attempt_id === attempt &&
              d.status === "sending",
          );
          if (!d) return false;
          Object.assign(d, {
            status,
            lease_until: null,
            provider_id: provider,
            last_error: code,
          });
          if (status === "accepted") d.accepted_at = new Date().toISOString();
          const a = s.reportAttempts.find((a) => a.id === attempt);
          if (a)
            Object.assign(a, {
              status,
              finished_at: new Date().toISOString(),
              provider_id: provider,
            });
          s.audit.push({
            event: "patient_report_send_" + status,
            appointment_id: d.appointment_id,
            details: { delivery_id: id, attempt_id: attempt },
            at: new Date().toISOString(),
          });
          return true;
        }),
      event: (id: string, event: string, status: Delivery["status"]) =>
        localTransaction((s) => {
          const d = s.reportDeliveries.find((d) => d.id === id);
          if (d) {
            d.provider_event = event;
            d.status = status;
          }
        }),
      reserveCode: (c: ReportChallenge) =>
        localTransaction((s) => {
          const d = s.reportDeliveries.find(
            (d) =>
              d.id === c.delivery_id &&
              !d.revoked_at &&
              Date.parse(d.expires_at) > Date.now() &&
              !["failed", "bounced"].includes(d.status),
          );
          const recent = s.reportChallenges.filter(
            (c) => Date.parse(c.created_at) > Date.now() - 3600000,
          );
          if (
            !d ||
            recent.some(
              (v) =>
                v.delivery_id === c.delivery_id &&
                Date.parse(v.created_at) > Date.now() - 60000,
            ) ||
            recent.filter((v) => v.delivery_id === c.delivery_id).length >= 5 ||
            recent.filter((v) => v.ip_hash === c.ip_hash).length >= 30
          )
            return false;
          for (const v of s.reportChallenges)
            if (v.delivery_id === c.delivery_id) v.consumed = true;
          s.reportChallenges.push(c);
          return true;
        }),
      codeDelivery: (id: string, delivered: boolean) =>
        localTransaction((s) => {
          const c = s.reportChallenges.find((c) => c.id === id);
          if (c) {
            c.delivered = delivered;
            if (!delivered) c.consumed = true;
          }
        }),
      verifyCode: (
        id: string,
        delivery: string,
        digest: string,
        sessionHash: string,
      ) =>
        localTransaction((s) => {
          const d = s.reportDeliveries.find(
            (d) =>
              d.id === delivery &&
              !d.revoked_at &&
              Date.parse(d.expires_at) > Date.now() &&
              !["failed", "bounced"].includes(d.status),
          );
          const c = s.reportChallenges.find(
            (c) => c.id === id && c.delivery_id === delivery,
          );
          if (
            !d ||
            !c ||
            c.consumed ||
            !c.delivered ||
            c.attempts >= 5 ||
            Date.parse(c.expires_at) <= Date.now()
          )
            return false;
          if (c.code_digest !== digest) {
            c.attempts++;
            return false;
          }
          c.consumed = true;
          s.reportSessions.push({
            session_hash: sessionHash,
            delivery_id: delivery,
            expires_at: new Date(
              Math.min(Date.now() + 7200000, Date.parse(d.expires_at)),
            ).toISOString(),
          });
          s.audit.push({
            event: "approved_patient_report_opened",
            appointment_id: d.appointment_id,
            details: { delivery_id: delivery },
            at: new Date().toISOString(),
          });
          return true;
        }),
      session: (hash: string) =>
        localTransaction(
          (s) => s.reportSessions.find((v) => v.session_hash === hash) || null,
        ),
      logout: (hash: string) =>
        localTransaction((s) => {
          s.reportSessions = s.reportSessions.filter(
            (v) => v.session_hash !== hash,
          );
        }),
    };
  const db = supabaseAdmin();
  return {
    async read(pid: string) {
      const results = await Promise.all([
        db
          .from("patient_visit_workspaces")
          .select("*")
          .eq("appointment_id", pid)
          .maybeSingle(),
        db
          .from("patient_record_versions")
          .select("*")
          .eq("appointment_id", pid)
          .order("created_at", { ascending: false })
          .limit(1000),
        db
          .from("patient_report_approvals")
          .select(
            "id,appointment_id,version_id,language,recipient,content_hash,snapshot,pdf_sha256,approved_by,approver_identity,approved_at",
          )
          .eq("appointment_id", pid),
        db
          .from("patient_report_deliveries")
          .select("*")
          .eq("appointment_id", pid)
          .order("created_at", { ascending: false }),
        db
          .from("patient_draft_jobs")
          .select("*")
          .eq("appointment_id", pid)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const workspace = checked(results[0]) as VisitWorkspace | null;
      const versions = checked(results[1]) as RecordVersion[];
      const missingHeads = [
        workspace?.findings_id,
        workspace?.lifestyle_id,
        workspace?.summary_id,
      ].filter((id): id is string =>
        Boolean(id && !versions.some((v) => v.id === id)),
      );
      if (missingHeads.length)
        versions.push(
          ...(checked(
            await db
              .from("patient_record_versions")
              .select("*")
              .eq("appointment_id", pid)
              .in("id", missingHeads),
          ) as RecordVersion[]),
        );
      const deliveries = checked(results[3]) as Delivery[];
      const attempts = deliveries.length
        ? checked(
            await db
              .from("patient_report_send_attempts")
              .select("*")
              .in(
                "delivery_id",
                deliveries.map((d) => d.id),
              ),
          )
        : [];
      return {
        workspace: workspace || {
          appointment_id: pid,
          findings_id: null,
          lifestyle_id: null,
          summary_id: null,
          approval_id: null,
        },
        versions,
        approvals: checked(results[2]) as Approval[],
        deliveries,
        attempts: attempts as SendAttempt[],
        jobs: checked(results[4]) as DraftJob[],
      };
    },
    async version(pid: string, id: string) {
      return checked(
        await db
          .from("patient_record_versions")
          .select("*")
          .eq("id", id)
          .eq("appointment_id", pid)
          .maybeSingle(),
      ) as RecordVersion | null;
    },
    async approval(id: string) {
      return checked(
        await db
          .from("patient_report_approvals")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      ) as Approval | null;
    },
    async delivery(tokenHash: string) {
      return checked(
        await db
          .from("patient_report_deliveries")
          .select("*")
          .eq("token_hash", tokenHash)
          .maybeSingle(),
      ) as Delivery | null;
    },
    async mutate(actor: string, pid: string, action: string, payload: Payload) {
      return checked(
        await db.rpc("mutate_visit_record", {
          p_actor: actor,
          p_patient: pid,
          p_action: action,
          p_payload: payload,
        }),
      );
    },
    async updateJob(id: string, patch: Partial<DraftJob>) {
      return Boolean(
        checked(
          await db
            .from("patient_draft_jobs")
            .update(patch)
            .eq("id", id)
            .eq("status", "processing")
            .gt("lease_until", new Date().toISOString())
            .select("id"),
        )?.length,
      );
    },
    async finishDraft(
      id: string,
      data: RecordVersion["data"],
      sources: RecordVersion["source_snapshot"],
    ) {
      return checked(
        await db.rpc("finish_patient_draft", {
          p_job: id,
          p_data: data,
          p_sources: sources,
        }),
      ) as RecordVersion | null;
    },
    async finishSend(
      id: string,
      attempt: string,
      status: "accepted" | "failed" | "unknown",
      provider: string | null,
      code: string | null,
    ) {
      return (
        checked(
          await db.rpc("finish_report_send", {
            p_delivery: id,
            p_attempt: attempt,
            p_status: status,
            p_provider: provider,
            p_error: code,
          }),
        ) === true
      );
    },
    async event(id: string, event: string, status: Delivery["status"]) {
      checked(
        await db
          .from("patient_report_deliveries")
          .update({ provider_event: event, status })
          .eq("id", id),
      );
    },
    async reserveCode(c: ReportChallenge) {
      return (
        checked(await db.rpc("reserve_report_code", { p_challenge: c })) ===
        true
      );
    },
    async codeDelivery(id: string, delivered: boolean) {
      checked(
        await db
          .from("patient_report_challenges")
          .update({ delivered, consumed: !delivered })
          .eq("id", id),
      );
    },
    async verifyCode(
      id: string,
      delivery: string,
      digest: string,
      sessionHash: string,
    ) {
      return (
        checked(
          await db.rpc("verify_report_code", {
            p_id: id,
            p_delivery: delivery,
            p_digest: digest,
            p_session: sessionHash,
          }),
        ) === true
      );
    },
    async session(hash: string) {
      return checked(
        await db
          .from("patient_report_sessions")
          .select("*")
          .eq("session_hash", hash)
          .maybeSingle(),
      ) as ReportSession | null;
    },
    async logout(hash: string) {
      checked(
        await db
          .from("patient_report_sessions")
          .delete()
          .eq("session_hash", hash),
      );
    },
  };
}
