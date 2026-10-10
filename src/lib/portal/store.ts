import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BUCKET, localTestMode, supabaseServerKey } from "./config";
import { localStore } from "./local-store";
import { PortalError } from "./security";
import { deletionResult } from "./deletion-result";
import type {
  Appointment,
  DocumentRecord,
  PortalSession,
  Staff,
  AuditEvent,
} from "./types";

export interface PortalStore {
  staff(id: string): Promise<Staff | null>;
  staffByEmail(email: string): Promise<Staff | null>;
  appointment(id: string): Promise<Appointment | null>;
  appointments(): Promise<Appointment[]>;
  createAppointment(value: Appointment): Promise<void>;
  verifyPatient(
    tokenHash: string,
    digest: string,
    session: PortalSession,
  ): Promise<boolean>;
  session(hash: string): Promise<PortalSession | null>;
  createSession(value: PortalSession): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  documents(appointmentId: string): Promise<DocumentRecord[]>;
  document(id: string): Promise<DocumentRecord | null>;
  saveDocument(record: DocumentRecord, bytes: Buffer): Promise<void>;
  saveClinicDocument(
    record: DocumentRecord,
    bytes: Buffer,
    actor: string,
  ): Promise<void>;
  submitClinic(id: string, actor: string): Promise<boolean>;
  readDocument(record: DocumentRecord): Promise<Buffer>;
  submit(id: string): Promise<boolean>;
  revoke(id: string): Promise<void>;
  deleteAppointment(
    id: string,
    actor: string,
    confirmation: string,
  ): Promise<boolean>;
  rename(id: string, label: string, previous: string): Promise<boolean>;
  review(id: string): Promise<void>;
  audit(value: AuditEvent): Promise<void>;
}
export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL!, supabaseServerKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const checked = <T>(result: { data: T; error: unknown }) => {
  if (result.error) throw new Error("STORAGE_OPERATION_FAILED");
  return result.data;
};
export function getStore(): PortalStore {
  if (localTestMode()) return localStore;
  const db = supabaseAdmin();
  return {
    async staff(id) {
      return checked(
        await db.from("clinic_staff").select("*").eq("id", id).maybeSingle(),
      ) as Staff | null;
    },
    async staffByEmail(email) {
      return checked(
        await db
          .from("clinic_staff")
          .select("*")
          .eq("email", email)
          .maybeSingle(),
      ) as Staff | null;
    },
    async appointment(id) {
      return checked(
        await db.from("appointments").select("*").eq("id", id).maybeSingle(),
      ) as Appointment | null;
    },
    async appointments() {
      return checked(
        await db
          .from("appointments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ) as Appointment[];
    },
    async createAppointment(value) {
      const result = await db.from("appointments").insert(value);
      if (
        result.error &&
        value.intake_mode === "clinic" &&
        ["42703", "PGRST204"].includes(result.error.code)
      )
        throw new PortalError(
          503,
          "CLINIC_MIGRATION_REQUIRED",
          "יש להחיל את עדכון מסד הנתונים לקליטת מסמכים במרפאה.",
        );
      checked(result);
    },
    async verifyPatient(tokenHash, digest, session) {
      return (
        checked(
          await db.rpc("verify_patient_pin", {
            p_token_hash: tokenHash,
            p_pin_digest: digest,
            p_session_hash: session.session_hash,
          }),
        ) === true
      );
    },
    async session(hash) {
      return checked(
        await db
          .from("portal_sessions")
          .select("*")
          .eq("session_hash", hash)
          .maybeSingle(),
      ) as PortalSession | null;
    },
    async createSession(value) {
      checked(await db.from("portal_sessions").insert(value));
    },
    async deleteSession(hash) {
      checked(
        await db.from("portal_sessions").delete().eq("session_hash", hash),
      );
    },
    async documents(id) {
      return checked(
        await db
          .from("documents")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at"),
      ) as DocumentRecord[];
    },
    async document(id) {
      return checked(
        await db.from("documents").select("*").eq("id", id).maybeSingle(),
      ) as DocumentRecord | null;
    },
    async saveDocument(record, bytes) {
      checked(
        await db.storage.from(BUCKET).upload(record.storage_path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        }),
      );
      try {
        checked(await db.rpc("attach_document", { p_record: record }));
      } catch (error) {
        await db.storage.from(BUCKET).remove([record.storage_path]);
        throw error;
      }
    },
    async saveClinicDocument(record, bytes, actor) {
      checked(
        await db.storage.from(BUCKET).upload(record.storage_path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        }),
      );
      try {
        const result = await db.rpc("attach_clinic_document", {
          p_record: record,
          p_actor: actor,
        });
        if (result.error?.code === "PGRST202" || result.error?.code === "42883")
          throw new PortalError(
            503,
            "CLINIC_MIGRATION_REQUIRED",
            "יש להחיל את עדכון מסד הנתונים לקליטת מסמכים במרפאה.",
          );
        checked(result);
      } catch (error) {
        await db.storage.from(BUCKET).remove([record.storage_path]);
        throw error;
      }
    },
    async submitClinic(id, actor) {
      const result = await db.rpc("submit_clinic_appointment", {
        p_id: id,
        p_actor: actor,
      });
      if (result.error?.code === "PGRST202" || result.error?.code === "42883")
        throw new PortalError(
          503,
          "CLINIC_MIGRATION_REQUIRED",
          "יש להחיל את עדכון מסד הנתונים לקליטת מסמכים במרפאה.",
        );
      return checked(result) === true;
    },
    async readDocument(record) {
      const blob = checked(
        await db.storage.from(BUCKET).download(record.storage_path),
      );
      if (!blob) throw new Error("DOCUMENT_NOT_FOUND");
      return Buffer.from(await blob.arrayBuffer());
    },
    async submit(id) {
      return checked(await db.rpc("submit_appointment", { p_id: id })) === true;
    },
    async deleteAppointment(id, actor, confirmation) {
      const result = deletionResult(
        await db.rpc("begin_patient_card_delete", {
          p_actor: actor,
          p_id: id,
          p_confirmation: confirmation,
        }),
      ) as { paths: string[] } | null;
      if (!result) return false;
      if (!result.paths.every((p) => p.startsWith(id + "/")))
        throw new PortalError(
          503,
          "DELETION_PENDING",
          "המחיקה לא הושלמה. התיק חסום לגישה; אפשר לנסות שוב כדי להשלים את הסרת הקבצים.",
        );
      // Keep blocked metadata until private-file removal succeeds; a retry is safe.
      if (result.paths.length) {
        const removed = await db.storage.from(BUCKET).remove(result.paths);
        if (removed.error)
          throw new PortalError(
            503,
            "DELETION_PENDING",
            "המחיקה לא הושלמה. התיק חסום לגישה; אפשר לנסות שוב כדי להשלים את הסרת הקבצים.",
          );
      }
      return (
        deletionResult(
          await db.rpc("finish_patient_card_delete", {
            p_actor: actor,
            p_id: id,
          }),
        ) === true
      );
    },
    async revoke(id) {
      checked(await db.rpc("revoke_invitation", { p_id: id }));
    },
    async rename(id, label, previous) {
      const rows = checked(
        await db
          .from("appointments")
          .update({ patient_label: label })
          .eq("id", id)
          .eq("patient_label", previous)
          .is("deletion_requested_at", null)
          .select("id"),
      );
      return rows?.length === 1;
    },
    async review(id) {
      checked(
        await db
          .from("appointments")
          .update({ status: "reviewed" })
          .eq("id", id)
          .eq("status", "submitted"),
      );
    },
    async audit(value) {
      checked(await db.from("audit_events").insert(value));
    },
  };
}
