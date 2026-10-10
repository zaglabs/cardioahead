import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { PortalError } from "@/lib/portal/security";
import { supabaseAdmin } from "@/lib/portal/store";
import { randomUUID } from "node:crypto";
import type { EvidenceRecord } from "./types";
function checked<T>(r: { data: T; error: unknown }) {
  if (r.error)
    throw new PortalError(
      503,
      "EVIDENCE_STORAGE",
      "יש להחיל את עדכון מסד הנתונים לסקירת ראיות קליניות.",
    );
  return r.data;
}
export function evidenceStore() {
  if (localTestMode())
    return {
      list: (id: string) =>
        localTransaction((s) =>
          s.evidenceReviews
            .filter((r) => r.appointment_id === id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
      queue: (
        appointmentId: string,
        actor: string,
        version: string,
        question: string,
        kind: "question" | "plan",
        regenerate: boolean,
      ) =>
        localTransaction((s) => {
          if (
            !s.staff.some(
              (v) =>
                v.id === actor &&
                v.status === "active" &&
                (v.role === "admin" || v.role === "professor"),
            ) ||
            !s.appointments.some(
              (v) => v.id === appointmentId && !v.deletion_requested_at,
            )
          )
            throw new Error("CLINICIAN_REQUIRED");
          const rows = s.evidenceReviews
            .filter((r) => r.appointment_id === appointmentId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          for (const r of rows)
            if (
              r.status === "processing" &&
              Date.parse(r.lease_until) <= Date.now()
            )
              Object.assign(r, {
                status: "failed",
                stage: "failed",
                error_code: "JOB_EXPIRED",
              });
          const running = rows.find((r) => r.status === "processing");
          if (running) return { record: running, started: false };
          const previous = rows[0];
          if (
            !regenerate &&
            previous?.status === "ready" &&
            previous.document_version === version &&
            previous.question === question &&
            previous.question_kind === kind
          )
            return { record: previous, started: false };
          if (previous && Date.now() - Date.parse(previous.created_at) < 15000)
            throw new PortalError(
              429,
              "EVIDENCE_COOLDOWN",
              "המתינו כמה שניות לפני יצירת סקירה נוספת.",
            );
          const r: EvidenceRecord = {
            id: randomUUID(),
            appointment_id: appointmentId,
            created_by: actor,
            document_version: version,
            status: "processing",
            stage: "analysing",
            question,
            question_kind: kind,
            context: null,
            retrieval: null,
            report: null,
            created_at: new Date().toISOString(),
            completed_at: null,
            searched_at: null,
            lease_until: new Date(Date.now() + 300000).toISOString(),
            error_code: null,
            model: null,
          };
          s.evidenceReviews.push(r);
          s.audit.push({
            event: "evidence_review_requested",
            actor_id: actor,
            appointment_id: appointmentId,
            at: r.created_at,
          });
          return { record: r, started: true };
        }),
      update: (id: string, patch: Partial<EvidenceRecord>) =>
        localTransaction((s) => {
          const r = s.evidenceReviews.find(
            (v) =>
              v.id === id &&
              v.status === "processing" &&
              Date.parse(v.lease_until) > Date.now(),
          );
          if (!r) return false;
          Object.assign(r, patch);
          return true;
        }),
    };
  const db = supabaseAdmin();
  return {
    async list(id: string) {
      return checked(
        await db
          .from("clinical_evidence_reviews")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ) as EvidenceRecord[];
    },
    async queue(
      appointmentId: string,
      actor: string,
      version: string,
      question: string,
      kind: "question" | "plan",
      regenerate: boolean,
    ) {
      const result = await db.rpc("queue_evidence_review", {
        p_actor: actor,
        p_id: appointmentId,
        p_version: version,
        p_question: question,
        p_kind: kind,
        p_regenerate: regenerate,
      });
      if (result.error?.message?.includes("review cooldown"))
        throw new PortalError(
          429,
          "EVIDENCE_COOLDOWN",
          "המתינו כמה שניות לפני יצירת סקירה נוספת.",
        );
      return checked(result) as { record: EvidenceRecord; started: boolean };
    },
    async update(id: string, patch: Partial<EvidenceRecord>) {
      const result = checked(
        await db
          .from("clinical_evidence_reviews")
          .update(patch)
          .eq("id", id)
          .eq("status", "processing")
          .gt("lease_until", new Date().toISOString())
          .select("id"),
      );
      return Boolean(result?.length);
    },
  };
}
