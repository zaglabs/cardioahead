import "server-only";
import { medicalMetadataBundle } from "./schema.mjs";
import { randomUUID } from "node:crypto";
import { localTestMode } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { supabaseAdmin } from "@/lib/portal/store";
import { PortalError } from "@/lib/portal/security";
import { isAdmin } from "@/lib/portal/staff-access";
import type { MedicalImport, ImportGrant } from "./types";
import type { MedicalBundle, MedicalSummary, MedicalSlide } from "./schema.mjs";
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error)
    throw new PortalError(
      503,
      "MEDICAL_IMPORT_STORAGE",
      "יש להשלים את חיבור הייבוא האישי במסד הנתונים.",
    );
  return result.data;
}
export async function latestMedicalImport(
  appointment: string,
): Promise<MedicalImport | null> {
  if (localTestMode())
    return localTransaction(
      (state) =>
        (state.medicalImports || [])
          .filter((item) => item.appointment_id === appointment)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null,
    );
  const result = await supabaseAdmin()
    .from("medical_record_imports")
    .select("*")
    .eq("appointment_id", appointment)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error && ["42P01", "PGRST205"].includes(result.error.code))
    return null;
  return checked(result) as MedicalImport | null;
}
export async function medicalImportById(
  id: string,
): Promise<MedicalImport | null> {
  if (localTestMode())
    return localTransaction(
      (state) =>
        (state.medicalImports || []).find((item) => item.id === id) || null,
    );
  return checked(
    await supabaseAdmin()
      .from("medical_record_imports")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
  ) as MedicalImport | null;
}
export async function medicalSourceById(id: string) {
  if (localTestMode())
    return localTransaction((state) => {
      for (const item of state.medicalImports || []) {
        const record = item.bundle.records.find((record) => record.id === id);
        if (record) return { appointment_id: item.appointment_id, record };
      }
      return null;
    });
  const item = checked(
    await supabaseAdmin()
      .from("medical_record_imports")
      .select("appointment_id,bundle")
      .contains("bundle", { records: [{ id }] })
      .limit(1)
      .maybeSingle(),
  ) as { appointment_id: string; bundle: MedicalBundle } | null;
  const record = item?.bundle.records.find((record) => record.id === id);
  return item && record
    ? { appointment_id: item.appointment_id, record }
    : null;
}
export async function createImportGrant(
  appointment: string,
  actor: string,
  tokenHash: string,
  consent: boolean,
): Promise<ImportGrant> {
  if (localTestMode())
    return localTransaction((state) => {
      const owner = state.staff.find((staff) => staff.id === actor),
        card = state.appointments.find((card) => card.id === appointment);
      if (
        !owner ||
        !isAdmin(owner) ||
        !card ||
        card.deletion_requested_at ||
        card.intake_mode !== "clinic" ||
        card.created_by !== actor ||
        state.documents.some((doc) => doc.appointment_id === appointment)
      )
        throw new PortalError(
          403,
          "PERSONAL_CARD_REQUIRED",
          "פתחו תיק אישי נפרד במרפאה לצורך הבדיקה.",
        );
      const grant: ImportGrant = {
        token_hash: tokenHash,
        appointment_id: appointment,
        owner_id: actor,
        ai_consent: consent,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 45 * 60000).toISOString(),
        used_at: null,
        import_id: null,
      };
      (state.importGrants ??= []).push(grant);
      return grant;
    });
  return checked(
    await supabaseAdmin().rpc("create_medical_import_grant", {
      p_actor: actor,
      p_appointment: appointment,
      p_hash: tokenHash,
      p_ai_consent: consent,
    }),
  ) as ImportGrant;
}
export async function getImportGrant(
  tokenHash: string,
): Promise<ImportGrant | null> {
  if (localTestMode())
    return localTransaction(
      (state) =>
        (state.importGrants || []).find(
          (item) => item.token_hash === tokenHash,
        ) || null,
    );
  return checked(
    await supabaseAdmin()
      .from("medical_import_grants")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle(),
  ) as ImportGrant | null;
}
export async function acceptMedicalImport(
  tokenHash: string,
  sourceHash: string,
  bundle: MedicalBundle,
): Promise<{
  id: string;
  appointment_id: string;
  owner_id: string;
  reused: boolean;
}> {
  if (localTestMode())
    return localTransaction((state) => {
      const grant = (state.importGrants || []).find(
        (grant) => grant.token_hash === tokenHash,
      );
      const actor = state.staff.find((staff) => staff.id === grant?.owner_id),
        card = state.appointments.find(
          (card) => card.id === grant?.appointment_id,
        );
      if (
        !grant ||
        Date.parse(grant.expires_at) <= Date.now() ||
        !actor ||
        !isAdmin(actor) ||
        !card ||
        card.deletion_requested_at ||
        (grant.origin_kind === "patient"
          ? card.intake_mode !== "invitation" ||
            Boolean(card.revoked_at) ||
            Date.parse(card.expires_at) <= Date.now() ||
            !(state.invitationLinks || []).some(
              (i) =>
                i.id === grant.invitation_id &&
                i.token_hash === card.token_hash &&
                !i.revoked_at &&
                !i.deleted_at,
            ) ||
            !state.sessions.some(
              (s) =>
                s.session_hash === grant.patient_session_hash &&
                s.appointment_id === card.id &&
                Date.parse(s.expires_at) > Date.now(),
            )
          : card.intake_mode !== "clinic" || card.created_by !== actor.id) ||
        state.documents.some((doc) => doc.appointment_id === card.id)
      )
        throw new PortalError(
          403,
          "IMPORT_GRANT_EXPIRED",
          "קישור הייבוא אינו זמין. צרו חיבור חדש מתוך התיק האישי.",
        );
      const existing = (state.medicalImports || []).find(
        (item) =>
          item.appointment_id === card.id && item.source_hash === sourceHash,
      );
      if (grant.used_at && existing?.id !== grant.import_id)
        throw new PortalError(
          409,
          "IMPORT_GRANT_USED",
          "קישור הייבוא כבר שימש להעברה אחרת.",
        );
      const row: MedicalImport = existing || {
        id: randomUUID(),
        appointment_id: card.id,
        owner_id: actor.id,
        provider: "clalit",
        origin_kind: grant.origin_kind || "personal",
        invitation_id: grant.invitation_id || null,
        patient_consent_version:
          grant.origin_kind === "patient" ? "clalit-patient-v1" : null,
        source_hash: sourceHash,
        bundle: medicalMetadataBundle(bundle),
        ai_consent: grant.ai_consent,
        consent_at: grant.created_at,
        status: "received",
        summary: null,
        model: null,
        error_code: null,
        attempts: 0,
        lease_token: null,
        lease_until: null,
        visual: null,
        visual_created_by: null,
        visual_created_at: null,
        review_overrides: {},
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      if (!existing) (state.medicalImports ??= []).push(row);
      grant.used_at = new Date().toISOString();
      grant.import_id = row.id;
      const invitation = (state.invitationLinks || []).find(
        (i) => i.id === grant.invitation_id,
      );
      if (invitation)
        invitation.clalit_connected_at ||= new Date().toISOString();
      card.personal_import_source = true;
      card.medical_records_count = bundle.records.length;
      if (card.status === "invited") {
        card.status = "submitted";
        card.submitted_at = new Date().toISOString();
      }
      state.audit.push({
        event: "personal_records_imported",
        actor_id: actor.id,
        appointment_id: card.id,
        details: { record_count: bundle.records.length, import_id: row.id },
        at: new Date().toISOString(),
      });
      return {
        id: row.id,
        appointment_id: card.id,
        owner_id: actor.id,
        reused: Boolean(existing),
      };
    });
  return checked(
    await supabaseAdmin().rpc("accept_medical_import", {
      p_hash: tokenHash,
      p_source_hash: sourceHash,
      p_bundle: medicalMetadataBundle(bundle),
    }),
  );
}
export async function claimMedicalSummary(
  id: string,
  actor: string,
  token: string,
): Promise<boolean> {
  if (localTestMode())
    return localTransaction((state) => {
      const owner = state.staff.find((staff) => staff.id === actor),
        row = (state.medicalImports || []).find(
          (item) => item.id === id && item.owner_id === actor,
        ),
        card = state.appointments.find(
          (card) => card.id === row?.appointment_id,
        );
      if (
        !owner ||
        !isAdmin(owner) ||
        !row ||
        !card ||
        card.deletion_requested_at ||
        !row.ai_consent ||
        row.status === "ready" ||
        row.attempts >= 3 ||
        (row.status === "generating" &&
          Date.parse(row.lease_until || "") > Date.now())
      )
        return false;
      row.status = "generating";
      row.attempts++;
      row.lease_token = token;
      row.lease_until = new Date(Date.now() + 300000).toISOString();
      row.error_code = null;
      return true;
    });
  return checked(
    await supabaseAdmin().rpc("claim_medical_summary", {
      p_id: id,
      p_actor: actor,
      p_token: token,
    }),
  );
}
export async function finishMedicalSummary(
  id: string,
  token: string,
  summary: MedicalSummary,
  model: string,
  evidence: MedicalBundle,
): Promise<boolean> {
  if (localTestMode())
    return localTransaction((state) => {
      const row = (state.medicalImports || []).find((item) => item.id === id),
        card = state.appointments.find(
          (card) => card.id === row?.appointment_id,
        );
      if (
        !row ||
        !card ||
        card.deletion_requested_at ||
        (row.origin_kind === "patient" &&
          (card.revoked_at ||
            Date.parse(card.expires_at) <= Date.now() ||
            !(state.invitationLinks || []).some(
              (i) =>
                i.id === row.invitation_id &&
                i.token_hash === card.token_hash &&
                !i.revoked_at &&
                !i.deleted_at,
            ))) ||
        row.status !== "generating" ||
        row.lease_token !== token ||
        Date.parse(row.lease_until || "") <= Date.now()
      )
        return false;
      Object.assign(row, {
        status: "ready",
        summary,
        bundle: evidence,
        model,
        completed_at: new Date().toISOString(),
        lease_token: null,
        lease_until: null,
        error_code: null,
      });
      const invitation = (state.invitationLinks || []).find(
        (i) => i.id === row.invitation_id,
      );
      if (invitation) invitation.latest_import_at = row.completed_at;
      return true;
    });
  return checked(
    await supabaseAdmin().rpc("finish_medical_summary", {
      p_id: id,
      p_token: token,
      p_summary: summary,
      p_model: model,
      p_evidence: evidence,
    }),
  );
}
export async function failMedicalSummary(
  id: string,
  token: string,
  error: string,
) {
  if (localTestMode())
    return localTransaction((state) => {
      const row = (state.medicalImports || []).find(
        (item) =>
          item.id === id &&
          item.lease_token === token &&
          item.status === "generating",
      );
      if (row)
        Object.assign(row, {
          status: "failed",
          error_code: error,
          lease_token: null,
          lease_until: null,
        });
    });
  checked(
    await supabaseAdmin().rpc("fail_medical_summary", {
      p_id: id,
      p_token: token,
      p_error: error,
    }),
  );
}
export async function reviewMedicalImport(
  id: string,
  actor: string,
  source: string | null,
  include: boolean,
) {
  if (localTestMode())
    return localTransaction((state) => {
      const staff = state.staff.find((staff) => staff.id === actor),
        row = (state.medicalImports || []).find((item) => item.id === id),
        card = state.appointments.find(
          (card) => card.id === row?.appointment_id,
        );
      if (
        !staff ||
        staff.status !== "active" ||
        !["admin", "professor"].includes(staff.role) ||
        !row ||
        !card ||
        card.deletion_requested_at
      )
        return false;
      if (source) {
        if (!row.bundle.records.some((record) => record.id === source))
          return false;
        row.review_overrides[source] = include;
        row.reviewed_at = null;
        row.reviewed_by = null;
      } else {
        if (row.status !== "ready") return false;
        row.reviewed_by = actor;
        row.reviewed_at = new Date().toISOString();
      }
      return true;
    });
  return checked(
    await supabaseAdmin().rpc("review_medical_import", {
      p_id: id,
      p_actor: actor,
      p_source_id: source,
      p_include: include,
    }),
  );
}
export async function saveMedicalVisual(
  id: string,
  actor: string,
  slides: MedicalSlide[],
): Promise<{ content: { slides: MedicalSlide[] }; reused: boolean }> {
  if (localTestMode())
    return localTransaction((state) => {
      const staff = state.staff.find((staff) => staff.id === actor),
        row = (state.medicalImports || []).find((item) => item.id === id);
      if (
        !staff ||
        staff.status !== "active" ||
        !["admin", "professor"].includes(staff.role) ||
        !row ||
        row.status !== "ready" ||
        !row.summary?.visual_proposal.eligible
      )
        throw new PortalError(
          409,
          "NO_PROPOSAL",
          "אין הצעה נתמכת להסבר חזותי.",
        );
      if (row.visual) return { content: row.visual, reused: true };
      row.visual = { slides };
      row.visual_created_by = actor;
      row.visual_created_at = new Date().toISOString();
      return { content: row.visual, reused: false };
    });
  return checked(
    await supabaseAdmin().rpc("save_medical_visual", {
      p_id: id,
      p_actor: actor,
      p_visual: { slides },
    }),
  );
}

export async function createPatientImportGrant(
  sessionHash: string,
  tokenHash: string,
): Promise<ImportGrant> {
  if (!localTestMode())
    return checked(
      await supabaseAdmin().rpc("create_patient_import_grant", {
        p_session: sessionHash,
        p_hash: tokenHash,
        p_consent: true,
      }),
    ) as ImportGrant;
  return localTransaction((state) => {
    const session = state.sessions.find(
        (s) =>
          s.session_hash === sessionHash &&
          s.kind === "patient" &&
          Date.parse(s.expires_at) > Date.now(),
      ),
      card = state.appointments.find((a) => a.id === session?.appointment_id);
    const invitation = (state.invitationLinks || []).find(
      (i) =>
        i.appointment_id === card?.id &&
        i.token_hash === card?.token_hash &&
        !i.revoked_at &&
        !i.deleted_at,
    );
    const owner = state.staff.find(isAdmin);
    if (
      !session ||
      !card ||
      !invitation ||
      !owner ||
      card.intake_mode === "clinic" ||
      card.revoked_at ||
      card.deletion_requested_at ||
      Date.parse(card.expires_at) <= Date.now() ||
      state.documents.some((d) => d.appointment_id === card.id)
    )
      throw new PortalError(
        409,
        "PATIENT_IMPORT_UNAVAILABLE",
        "אין אפשרות לייבא לתיק זה. פנו למרפאה.",
      );
    const grant: ImportGrant = {
      token_hash: tokenHash,
      appointment_id: card.id,
      owner_id: owner.id,
      ai_consent: true,
      created_at: new Date().toISOString(),
      expires_at: new Date(
        Math.min(Date.now() + 45 * 60000, Date.parse(card.expires_at)),
      ).toISOString(),
      used_at: null,
      import_id: null,
      origin_kind: "patient",
      invitation_id: invitation.id,
      patient_session_hash: sessionHash,
    };
    (state.importGrants ??= []).push(grant);
    state.audit.push({
      event: "patient_clalit_consent",
      appointment_id: card.id,
      details: {
        consent_version: "clalit-patient-v1",
        ai_provider: "anthropic",
      },
      at: grant.created_at,
    });
    return grant;
  });
}
export async function cancelPatientImportGrants(
  appointment: string,
  sessionHash: string,
) {
  if (localTestMode()) {
    await localTransaction((state) => {
      for (const grant of state.importGrants || [])
        if (
          grant.origin_kind === "patient" &&
          grant.appointment_id === appointment &&
          grant.patient_session_hash === sessionHash &&
          !grant.used_at
        )
          grant.expires_at = new Date().toISOString();
    });
    return;
  }
  checked(
    await supabaseAdmin()
      .from("medical_import_grants")
      .update({ expires_at: new Date().toISOString() })
      .eq("origin_kind", "patient")
      .eq("appointment_id", appointment)
      .eq("patient_session_hash", sessionHash)
      .is("used_at", null),
  );
}
