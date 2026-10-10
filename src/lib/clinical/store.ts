import "server-only";
import { randomUUID } from "node:crypto";
import { localTestMode } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { supabaseAdmin } from "@/lib/portal/store";
import { PortalError } from "@/lib/portal/security";
import type {
  AnalysisRecord,
  ClinicalSource,
  ClinicalSummary,
  PresentationRecord,
} from "./types";
function checked<T>(r: { data: T; error: unknown }): T {
  if (r.error)
    throw new PortalError(
      503,
      "ANALYSIS_STORAGE",
      "יש להשלים את חיבור רשומות הסיכום וההסברים החזותיים במערכת.",
    );
  return r.data;
}
export function clinicalStore() {
  if (localTestMode())
    return {
      get: (id: string) =>
        localTransaction(
          (s) => s.analyses.find((a) => a.appointment_id === id) || null,
        ),
      presentation: (id: string) =>
        localTransaction(
          (s) => s.presentations.find((p) => p.appointment_id === id) || null,
        ),
      queue: (id: string) =>
        localTransaction((s) => {
          if (
            !s.appointments.some(
              (a) => a.id === id && a.status !== "invited",
            ) ||
            s.analyses.some((a) => a.appointment_id === id)
          )
            return;
          s.analyses.push({
            appointment_id: id,
            status: "queued",
            source_hash: null,
            sources: [],
            summary: null,
            model: null,
            attempts: 0,
            lease_token: null,
            lease_until: null,
            error_code: null,
            created_at: new Date().toISOString(),
            completed_at: null,
            reviewed_by: null,
            reviewed_at: null,
          });
        }),
      claim: (
        id: string,
        hash: string,
        sources: ClinicalSource[],
        token: string,
      ) =>
        localTransaction((s) => {
          if (
            !s.appointments.some((a) => a.id === id && a.status !== "invited")
          )
            return false;
          const a = s.analyses.find((a) => a.appointment_id === id);
          if (
            !a ||
            a.status === "ready" ||
            a.attempts >= 3 ||
            (a.lease_until &&
              Date.parse(a.lease_until) > Date.now() &&
              (a.status === "generating" || a.status === "failed"))
          )
            return false;
          Object.assign(a, {
            status: "generating",
            source_hash: hash,
            sources,
            lease_token: token,
            lease_until: new Date(Date.now() + 300000).toISOString(),
            attempts: a.attempts + 1,
            error_code: null,
          });
          return true;
        }),
      finish: (
        id: string,
        token: string,
        summary: ClinicalSummary,
        sources: ClinicalSource[],
        model: string,
      ) =>
        localTransaction((s) => {
          const a = s.analyses.find(
            (a) =>
              a.appointment_id === id &&
              a.lease_token === token &&
              a.status === "generating",
          );
          if (!a || !a.lease_until || Date.parse(a.lease_until) <= Date.now())
            return false;
          Object.assign(a, {
            status: "ready",
            summary,
            sources,
            model,
            completed_at: new Date().toISOString(),
            lease_token: null,
            lease_until: null,
            error_code: null,
          });
          s.audit.push({
            event: "summary_created",
            appointment_id: id,
            at: new Date().toISOString(),
          });
          return true;
        }),
      fail: (id: string, token: string, error: string) =>
        localTransaction((s) => {
          const a = s.analyses.find(
            (a) =>
              a.appointment_id === id &&
              a.lease_token === token &&
              a.status === "generating",
          );
          if (a)
            Object.assign(a, {
              status: "failed",
              lease_token: null,
              lease_until: new Date(Date.now() + 60000).toISOString(),
              error_code: error,
            });
        }),
      savePresentation: (
        id: string,
        actor: string,
        content: PresentationRecord["content"],
      ) =>
        localTransaction((s) => {
          const staff = s.staff.find(
            (v) =>
              v.id === actor &&
              v.status === "active" &&
              (v.role === "admin" || v.role === "professor"),
          );
          const a = s.analyses.find(
            (v) => v.appointment_id === id && v.status === "ready",
          );
          if (!staff || !a?.summary?.presentation.eligible || !a.source_hash)
            throw new Error("CLINICIAN_OR_SUMMARY_REQUIRED");
          const existing = s.presentations.find((p) => p.appointment_id === id);
          if (existing) return { record: existing, reused: true };
          const record: PresentationRecord = {
            id: randomUUID(),
            appointment_id: id,
            source_hash: a.source_hash,
            content,
            created_by: actor,
            created_at: new Date().toISOString(),
            reviewed_by: null,
            reviewed_at: null,
          };
          s.presentations.push(record);
          s.audit.push({
            event: "presentation_created",
            actor_id: actor,
            appointment_id: id,
            at: record.created_at,
          });
          return { record, reused: false };
        }),
      review: (id: string, actor: string, kind: "summary" | "presentation") =>
        localTransaction((s) => {
          if (
            !s.staff.some(
              (v) =>
                v.id === actor &&
                v.status === "active" &&
                (v.role === "admin" || v.role === "professor"),
            )
          )
            return false;
          const record =
            kind === "summary"
              ? s.analyses.find(
                  (v) => v.appointment_id === id && v.status === "ready",
                )
              : s.presentations.find((v) => v.appointment_id === id);
          if (!record) return false;
          record.reviewed_by = actor;
          record.reviewed_at = new Date().toISOString();
          s.audit.push({
            event: kind + "_reviewed",
            actor_id: actor,
            appointment_id: id,
            at: record.reviewed_at,
          });
          return true;
        }),
    };
  const db = supabaseAdmin();
  return {
    async get(id: string) {
      return checked(
        await db
          .from("visit_analysis")
          .select("*")
          .eq("appointment_id", id)
          .maybeSingle(),
      ) as AnalysisRecord | null;
    },
    async presentation(id: string) {
      return checked(
        await db
          .from("visit_presentations")
          .select("*")
          .eq("appointment_id", id)
          .maybeSingle(),
      ) as PresentationRecord | null;
    },
    async queue(id: string) {
      checked(await db.rpc("queue_visit_analysis", { p_id: id }));
    },
    async claim(
      id: string,
      hash: string,
      sources: ClinicalSource[],
      token: string,
    ) {
      return (
        checked(
          await db.rpc("claim_visit_analysis", {
            p_id: id,
            p_hash: hash,
            p_sources: sources,
            p_token: token,
          }),
        ) === true
      );
    },
    async finish(
      id: string,
      token: string,
      summary: ClinicalSummary,
      sources: ClinicalSource[],
      model: string,
    ) {
      return (
        checked(
          await db.rpc("finish_visit_analysis", {
            p_id: id,
            p_token: token,
            p_summary: summary,
            p_sources: sources,
            p_model: model,
          }),
        ) === true
      );
    },
    async fail(id: string, token: string, error: string) {
      checked(
        await db.rpc("fail_visit_analysis", {
          p_id: id,
          p_token: token,
          p_error: error,
        }),
      );
    },
    async savePresentation(
      id: string,
      actor: string,
      content: PresentationRecord["content"],
    ) {
      return checked(
        await db.rpc("save_visit_presentation", {
          p_id: id,
          p_actor: actor,
          p_content: content,
        }),
      ) as { record: PresentationRecord; reused: boolean };
    },
    async review(id: string, actor: string, kind: "summary" | "presentation") {
      return (
        checked(
          await db.rpc("review_visit_artifact", {
            p_id: id,
            p_actor: actor,
            p_kind: kind,
          }),
        ) === true
      );
    },
  };
}
