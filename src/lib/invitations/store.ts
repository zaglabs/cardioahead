import "server-only";
import { randomUUID } from "node:crypto";
import { localTestMode, secret } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { supabaseAdmin, getStore } from "@/lib/portal/store";
import {
  PortalError,
  hash,
  pinDigest,
  randomToken,
  newPin,
} from "@/lib/portal/security";
import { sealInvitation, openInvitation } from "./crypto.mjs";
import type { Appointment } from "@/lib/portal/types";
import type { InvitationLink, InvitationRow, InvitationSend } from "./types";
function checked<T>(result: { data: T; error: unknown }): T {
  if (
    result.error &&
    typeof result.error === "object" &&
    "message" in result.error &&
    String(result.error.message).includes("send rate limit")
  )
    throw new PortalError(429, "SEND_RATE_LIMIT", "נסו לשלוח שוב בעוד דקה.");
  if (result.error)
    throw new PortalError(
      503,
      "INVITATION_STORAGE",
      "יש להשלים את עדכון מסד הנתונים להזמנות.",
    );
  return result.data;
}
const binding = (
  row: Pick<InvitationLink, "id" | "appointment_id" | "token_hash">,
) => row.id + ":" + row.appointment_id + ":" + row.token_hash;
export function invitationUrl(token: string, language: string) {
  const base = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.cardioahead.com",
  );
  if (
    base.protocol !== "https:" &&
    !(localTestMode() && base.hostname === "127.0.0.1")
  )
    throw Error("INVALID_SITE_URL");
  return base.origin + "/invite/" + token + "?lang=" + language;
}
export async function issueInvitation(
  actor: string,
  appointment: Appointment,
  language: "he" | "en",
  replace = false,
) {
  const token = randomToken(),
    code = newPin(),
    id = randomUUID(),
    token_hash = hash(token);
  const a = {
    ...appointment,
    intake_mode: "invitation" as const,
    token_hash,
    pin_digest: pinDigest(token_hash, code),
    revoked_at: null,
    failed_attempts: 0,
  };
  const staff = await getStore().staff(actor);
  if (!staff || staff.status !== "active")
    throw new PortalError(403, "STAFF_REQUIRED", "נדרש חשבון צוות פעיל.");
  const row: InvitationLink = {
    id,
    appointment_id: a.id,
    token_hash,
    secret_ciphertext: null,
    language,
    issued_by: actor,
    issuer_label: staff.email,
    issued_at: new Date().toISOString(),
    expires_at: a.expires_at,
    revoked_at: null,
    deleted_at: null,
    first_viewed_at: null,
    last_viewed_at: null,
    first_verified_at: null,
    last_verified_at: null,
    clalit_connected_at: null,
    latest_import_at: null,
    last_sent_at: null,
    last_recipient: null,
    legacy: false,
  };
  row.secret_ciphertext = sealInvitation(
    { token, code },
    secret(),
    binding(row),
  );
  if (localTestMode())
    await localTransaction((state) => {
      const previous = state.appointments.find((item) => item.id === a.id);
      if (replace) {
        if (
          !previous ||
          previous.intake_mode === "clinic" ||
          previous.deletion_requested_at
        )
          throw new PortalError(
            409,
            "INVITATION_CHANGED",
            "ההזמנה אינה זמינה.",
          );
        for (const item of state.invitationLinks || [])
          if (item.appointment_id === a.id && !item.revoked_at) {
            item.revoked_at = row.issued_at;
            item.secret_ciphertext = null;
          }
        state.sessions = state.sessions.filter(
          (item) => item.appointment_id !== a.id,
        );
        Object.assign(previous, {
          token_hash,
          pin_digest: a.pin_digest,
          expires_at: a.expires_at,
          revoked_at: null,
          failed_attempts: 0,
        });
        a.status = previous.status;
      } else state.appointments.push(a);
      (state.invitationLinks ??= []).push(row);
      state.audit.push({
        event: "invitation_issued",
        actor_id: actor,
        appointment_id: a.id,
        at: row.issued_at,
      });
    });
  else {
    const result = checked(
      await supabaseAdmin().rpc("issue_invitation", {
        p_actor: actor,
        p_appointment: a,
        p_link: row,
        p_replace: replace,
      }),
    ) as { appointment: Appointment };
    Object.assign(a, result.appointment);
  }
  return {
    appointment: a,
    invitation: row,
    invitationUrl: invitationUrl(token, language),
    code,
  };
}
export async function invitationById(
  id: string,
): Promise<InvitationLink | null> {
  if (localTestMode())
    return localTransaction(
      (state) =>
        (state.invitationLinks || []).find((row) => row.id === id) || null,
    );
  return checked(
    await supabaseAdmin()
      .from("invitation_links")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
  ) as InvitationLink | null;
}
export async function invitationByHash(
  token: string,
): Promise<InvitationLink | null> {
  if (localTestMode())
    return localTransaction(
      (state) =>
        (state.invitationLinks || []).find((row) => row.token_hash === token) ||
        null,
    );
  return checked(
    await supabaseAdmin()
      .from("invitation_links")
      .select("*")
      .eq("token_hash", token)
      .maybeSingle(),
  ) as InvitationLink | null;
}
export async function invitationCredentials(
  row: InvitationLink,
  actor: string,
) {
  const a = await getStore().appointment(row.appointment_id);
  if (
    !a ||
    a.deletion_requested_at ||
    row.revoked_at ||
    row.deleted_at ||
    a.token_hash !== row.token_hash
  )
    throw new PortalError(409, "INVITATION_CHANGED", "ההזמנה אינה זמינה.");
  if (!row.secret_ciphertext)
    throw new PortalError(
      409,
      "LEGACY_INVITATION",
      "הקישור הישן אינו ניתן לשחזור. צרו קישור חדש.",
    );
  let packet;
  try {
    packet = openInvitation(row.secret_ciphertext, secret(), binding(row));
  } catch {
    throw new PortalError(
      409,
      "INVITATION_SECRET_UNAVAILABLE",
      "לא ניתן לשחזר את הקישור. צרו קישור חדש.",
    );
  }
  await getStore().audit({
    event: "invitation_credentials_viewed",
    actor_id: actor,
    appointment_id: row.appointment_id,
    details: { invitation_id: row.id },
  });
  return { url: invitationUrl(packet.token, row.language), code: packet.code };
}
type Filters = {
  search: string;
  status: string;
  followup: string;
  deleted: boolean;
  offset: number;
  limit: number;
};
export async function listInvitations(
  actor: string,
  f: Filters,
): Promise<{ items: InvitationRow[]; total: number }> {
  if (!localTestMode())
    return checked(
      await supabaseAdmin().rpc("list_invitation_links", {
        p_actor: actor,
        p_search: f.search,
        p_status: f.status,
        p_followup: f.followup,
        p_deleted: f.deleted,
        p_offset: f.offset,
        p_limit: f.limit,
      }),
    ) as { items: InvitationRow[]; total: number };
  return localTransaction((state) => {
    for (const a of state.appointments.filter(
      (item) => item.intake_mode !== "clinic",
    )) {
      if (
        !(state.invitationLinks || []).some(
          (item) => item.token_hash === a.token_hash,
        )
      ) {
        (state.invitationLinks ??= []).push({
          id: randomUUID(),
          appointment_id: a.id,
          token_hash: a.token_hash,
          secret_ciphertext: null,
          language: "he",
          issued_by: a.created_by,
          issuer_label:
            state.staff.find((staff) => staff.id === a.created_by)?.email ||
            null,
          issued_at: a.created_at,
          expires_at: a.expires_at,
          revoked_at: a.revoked_at,
          deleted_at: null,
          first_viewed_at: null,
          last_viewed_at: null,
          first_verified_at: null,
          last_verified_at: null,
          clalit_connected_at: null,
          latest_import_at: null,
          last_sent_at: null,
          last_recipient: null,
          legacy: true,
        });
      }
    }
    const rows: InvitationRow[] = (state.invitationLinks || []).flatMap(
      (row) => {
        const a = state.appointments.find((a) => a.id === row.appointment_id);
        if (!a) return [];
        const docs = state.documents
          .filter(
            (d) => d.invitation_id === row.id && d.upload_origin === "patient",
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const imported = (state.medicalImports || [])
          .filter((r) => r.invitation_id === row.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const { token_hash, secret_ciphertext, issued_by, ...safe } = row;
        void issued_by;
        return [
          {
            ...safe,
            patient_label: a.patient_label,
            recoverable: Boolean(secret_ciphertext),
            card_deleting: Boolean(a.deletion_requested_at),
            status:
              row.deleted_at || a.deletion_requested_at
                ? "deleted"
                : row.revoked_at || a.revoked_at || a.token_hash !== token_hash
                  ? "revoked"
                  : Date.parse(row.expires_at) <= Date.now()
                    ? "expired"
                    : "active",
            patient_upload_count: docs.length,
            latest_upload_at: docs[0]?.created_at || null,
            card_document_count: state.documents.filter(
              (d) => d.appointment_id === a.id,
            ).length,
            import_status: imported?.status || "not_started",
            import_record_count: imported?.bundle.records.length || null,
          },
        ];
      },
    );
    const filtered = rows
      .filter(
        (row) =>
          (f.deleted || row.status !== "deleted") &&
          (f.status === "all" || row.status === f.status) &&
          (!f.search ||
            (row.patient_label + " " + row.issuer_label)
              .toLowerCase()
              .includes(f.search.toLowerCase())) &&
          (f.followup === "all" ||
            (f.followup === "not_opened" && !row.first_verified_at) ||
            (f.followup === "no_documents" &&
              !row.patient_upload_count &&
              !row.latest_import_at) ||
            (f.followup === "import_failed" &&
              row.import_status === "failed") ||
            (f.followup === "import_pending" &&
              ["received", "generating"].includes(row.import_status))),
      )
      .sort(
        (a, b) =>
          b.issued_at.localeCompare(a.issued_at) || b.id.localeCompare(a.id),
      );
    return {
      items: filtered.slice(f.offset, f.offset + f.limit),
      total: filtered.length,
    };
  });
}
export async function manageInvitation(
  actor: string,
  id: string,
  action: string,
  expiry: string | null = null,
) {
  if (!localTestMode())
    return (
      checked(
        await supabaseAdmin().rpc("manage_invitation", {
          p_actor: actor,
          p_id: id,
          p_action: action,
          p_expiry: expiry,
        }),
      ) === true
    );
  return localTransaction((state) => {
    const row = (state.invitationLinks || []).find((row) => row.id === id),
      a = state.appointments.find((a) => a.id === row?.appointment_id);
    if (!row || !a || row.deleted_at || a.deletion_requested_at) return false;
    if (action === "extend") {
      if (
        row.revoked_at ||
        a.revoked_at ||
        a.token_hash !== row.token_hash ||
        !expiry ||
        Date.parse(expiry) <=
          Math.max(Date.now(), Date.parse(row.expires_at)) ||
        Date.parse(expiry) > Date.now() + 31 * 86400000
      )
        return false;
      row.expires_at = expiry;
      a.expires_at = expiry;
    } else if (["revoke", "delete"].includes(action)) {
      const now = new Date().toISOString();
      row.revoked_at ||= now;
      row.secret_ciphertext = null;
      if (action === "delete") row.deleted_at = now;
      if (a.token_hash === row.token_hash) {
        a.revoked_at = now;
        state.sessions = state.sessions.filter(
          (s) => s.appointment_id !== a.id,
        );
        for (const imported of state.medicalImports || [])
          if (
            imported.appointment_id === a.id &&
            imported.origin_kind === "patient" &&
            ["received", "generating"].includes(imported.status)
          ) {
            imported.status = "failed";
            imported.error_code = "ACCESS_REVOKED";
            imported.lease_token = null;
            imported.lease_until = null;
          }
      }
    } else return false;
    state.audit.push({
      event: "invitation_" + action,
      actor_id: actor,
      appointment_id: a.id,
      at: new Date().toISOString(),
    });
    return true;
  });
}
export async function recordInvitationView(token: string) {
  if (!localTestMode()) {
    checked(
      await supabaseAdmin().rpc("record_invitation_view", { p_hash: token }),
    );
    return;
  }
  await localTransaction((state) => {
    const row = (state.invitationLinks || []).find(
        (row) => row.token_hash === token,
      ),
      a = state.appointments.find((a) => a.id === row?.appointment_id);
    if (
      !row ||
      !a ||
      row.revoked_at ||
      row.deleted_at ||
      a.revoked_at ||
      a.deletion_requested_at ||
      a.token_hash !== token ||
      Date.parse(a.expires_at) <= Date.now()
    )
      return;
    row.first_viewed_at ||= new Date().toISOString();
    row.last_viewed_at = new Date().toISOString();
  });
}
export async function reserveSend(
  actor: string,
  id: string,
  request: string,
  recipient: string,
): Promise<InvitationSend> {
  if (!localTestMode())
    return checked(
      await supabaseAdmin().rpc("reserve_invitation_send", {
        p_actor: actor,
        p_id: id,
        p_request: request,
        p_recipient: recipient,
      }),
    ) as InvitationSend;
  return localTransaction((state) => {
    const row = (state.invitationLinks || []).find((r) => r.id === id);
    if (
      !row ||
      row.revoked_at ||
      row.deleted_at ||
      !row.secret_ciphertext ||
      Date.parse(row.expires_at) <= Date.now()
    )
      throw new PortalError(409, "INVITATION_CHANGED", "ההזמנה אינה פעילה.");
    const old = (state.invitationSends || []).find((r) => r.id === request);
    if (old) {
      if (
        old.invitation_id !== id ||
        old.actor_id !== actor ||
        old.recipient !== recipient
      )
        throw new PortalError(409, "SEND_CONFLICT", "בקשת השליחה השתנתה.");
      return old;
    }
    if (
      (state.invitationSends || []).some(
        (r) =>
          r.invitation_id === id &&
          Date.parse(r.created_at) > Date.now() - 60000,
      )
    )
      throw new PortalError(429, "SEND_RATE_LIMIT", "נסו לשלוח שוב בעוד דקה.");
    const attempt: InvitationSend = {
      id: request,
      invitation_id: id,
      actor_id: actor,
      recipient,
      status: "sending",
      provider_id: null,
      created_at: new Date().toISOString(),
      accepted_at: null,
    };
    (state.invitationSends ??= []).push(attempt);
    return attempt;
  });
}
export async function finishSend(
  actor: string,
  request: string,
  status: "accepted" | "failed" | "unknown",
  provider: string | null,
) {
  if (!localTestMode()) {
    checked(
      await supabaseAdmin().rpc("finish_invitation_send", {
        p_actor: actor,
        p_request: request,
        p_status: status,
        p_provider: provider,
      }),
    );
    return;
  }
  await localTransaction((state) => {
    const row = (state.invitationSends || []).find(
      (r) => r.id === request && r.actor_id === actor,
    );
    if (!row || row.status === "accepted") return;
    row.status = status;
    row.provider_id = provider;
    row.accepted_at = status === "accepted" ? new Date().toISOString() : null;
    const link = (state.invitationLinks || []).find(
      (i) => i.id === row.invitation_id,
    );
    if (link && row.accepted_at) {
      link.last_sent_at = row.accepted_at;
      link.last_recipient = row.recipient;
    }
  });
}
