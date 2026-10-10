import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { MAX_DOCUMENTS, localTestMode } from "./config";
import type { PortalStore } from "./store";
import type { AnalysisRecord, PresentationRecord } from "@/lib/clinical/types";
import type { OtpChallenge } from "./auth-store";
import { OWNER_EMAIL } from "./staff-access";
import { PortalError } from "./security";
import type {
  Staff,
  Appointment,
  DocumentRecord,
  PortalSession,
  AuditEvent,
} from "./types";
import type { EvidenceRecord } from "@/lib/evidence/types";
import type {
  RecordVersion,
  Approval,
  Delivery,
  DraftJob,
  SendAttempt,
  ReportChallenge,
  ReportSession,
  VisitWorkspace,
} from "@/lib/visit/types";
type State = {
  invitationLinks?: import("@/lib/invitations/types").InvitationLink[];
  invitationSends?: import("@/lib/invitations/types").InvitationSend[];
  medicalImports?: import("@/lib/medical-import/types").MedicalImport[];
  importGrants?: import("@/lib/medical-import/types").ImportGrant[];
  aiSettings?: import("@/lib/clinical/settings").AISettings;
  recordVersions: RecordVersion[];
  reportApprovals: Approval[];
  reportDeliveries: Delivery[];
  patientDraftJobs: DraftJob[];
  reportAttempts: SendAttempt[];
  reportChallenges: ReportChallenge[];
  reportSessions: ReportSession[];
  visitWorkspaces: VisitWorkspace[];
  evidenceReviews: EvidenceRecord[];
  analyses: AnalysisRecord[];
  presentations: PresentationRecord[];
  staff: Staff[];
  otps: OtpChallenge[];
  appointments: Appointment[];
  documents: DocumentRecord[];
  sessions: PortalSession[];
  audit: (AuditEvent & { at: string })[];
};
const globalState = globalThis as typeof globalThis & {
  cardioaheadLocalQueue?: Promise<unknown>;
};
const root = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.CARDIOAHEAD_LOCAL_DATA_DIR ||
      ".local-test-data",
  );
export async function localTransaction<T>(
  fn: (state: State) => T | Promise<T>,
): Promise<T> {
  if (!localTestMode()) throw new Error("LOCAL_STORE_DISABLED");
  const previous = globalState.cardioaheadLocalQueue || Promise.resolve();
  const work = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(root(), { recursive: true });
      const filename = path.join(
        /* turbopackIgnore: true */ root(),
        "state.json",
      );
      let state: State = {
        recordVersions: [],
        reportApprovals: [],
        reportDeliveries: [],
        patientDraftJobs: [],
        reportAttempts: [],
        reportChallenges: [],
        reportSessions: [],
        visitWorkspaces: [],
        evidenceReviews: [],
        analyses: [],
        presentations: [],
        staff: [owner],
        otps: [],
        appointments: [],
        documents: [],
        sessions: [],
        audit: [],
      };
      try {
        state = JSON.parse(
          await readFile(/* turbopackIgnore: true */ filename, "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      state.recordVersions ??= [];
      state.reportApprovals ??= [];
      state.reportDeliveries ??= [];
      state.patientDraftJobs ??= [];
      state.reportAttempts ??= [];
      state.reportChallenges ??= [];
      state.reportSessions ??= [];
      state.visitWorkspaces ??= [];
      state.evidenceReviews ??= [];
      state.analyses ??= [];
      state.presentations ??= [];
      state.staff ??= [owner];
      state.otps ??= [];
      const result = await fn(state);
      const temporary = filename + "." + randomUUID() + ".tmp";
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, filename);
      return result;
    });
  globalState.cardioaheadLocalQueue = work;
  return work;
}
const active = (a: Appointment | undefined) =>
  Boolean(
    a &&
    !a.deletion_requested_at &&
    !a.revoked_at &&
    Date.parse(a.expires_at) > Date.now(),
  );
const owner: Staff = {
  id: "00000000-0000-4000-8000-000000000001",
  email: OWNER_EMAIL,
  role: "admin",
  status: "active",
  created_at: new Date().toISOString(),
};
const persistDocument = (
  record: DocumentRecord,
  bytes: Buffer,
  actor?: string,
) =>
  localTransaction(async (s) => {
    const a = s.appointments.find((a) => a.id === record.appointment_id);
    if (actor && !s.staff.some((v) => v.id === actor && v.status === "active"))
      throw new Error("STAFF_REQUIRED");
    if (
      !a ||
      a.deletion_requested_at ||
      (!actor && !active(a)) ||
      a.status !== "invited"
    )
      throw new Error("UPLOAD_CLOSED");
    const documents = s.documents.filter((d) => d.appointment_id === a.id);
    if (
      documents.length >= MAX_DOCUMENTS ||
      documents.some((d) => d.sha256 === record.sha256)
    )
      throw new Error("DOCUMENT_LIMIT_OR_DUPLICATE");
    const file = path.join(
      /* turbopackIgnore: true */ root(),
      record.storage_path,
    );
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    record.upload_origin = actor ? "staff" : "patient";
    if (!actor)
      record.invitation_id =
        (s.invitationLinks || []).find(
          (i) => i.appointment_id === a.id && i.token_hash === a.token_hash,
        )?.id || null;
    s.documents.push(record);
    s.audit.push({
      event: actor ? "staff_document_uploaded" : "document_uploaded",
      actor_id: actor,
      appointment_id: a.id,
      document_id: record.id,
      at: new Date().toISOString(),
    });
  });

export const localStore: PortalStore = {
  async staff(id) {
    return localTransaction((s) => s.staff.find((v) => v.id === id) || null);
  },
  async staffByEmail(email) {
    return localTransaction(
      (s) => s.staff.find((v) => v.email === email) || null,
    );
  },
  appointment: (id) =>
    localTransaction((s) => s.appointments.find((a) => a.id === id) || null),
  appointments: () => localTransaction((s) => [...s.appointments].reverse()),
  createAppointment: (a) =>
    localTransaction((s) => {
      s.appointments.push(a);
      s.audit.push({
        event:
          a.intake_mode === "clinic"
            ? "clinic_card_created"
            : "invitation_created",
        appointment_id: a.id,
        actor_id: a.created_by || undefined,
        at: new Date().toISOString(),
      });
    }),
  verifyPatient: (tokenHash, digest, session) =>
    localTransaction((s) => {
      const a = s.appointments.find((a) => a.token_hash === tokenHash);
      if (!a || !active(a) || a.failed_attempts >= 5) return false;
      if (a.pin_digest !== digest) {
        a.failed_attempts++;
        return false;
      }
      a.failed_attempts = 0;
      const invitation = (s.invitationLinks || []).find(
        (i) => i.appointment_id === a.id && i.token_hash === a.token_hash,
      );
      if (invitation) {
        invitation.first_verified_at ||= new Date().toISOString();
        invitation.last_verified_at = new Date().toISOString();
      }
      s.sessions.push({
        ...session,
        appointment_id: a.id,
        expires_at: new Date(
          Math.min(Date.now() + 2 * 60 * 60 * 1000, Date.parse(a.expires_at)),
        ).toISOString(),
      });
      return true;
    }),
  session: (hash) =>
    localTransaction(
      (s) => s.sessions.find((v) => v.session_hash === hash) || null,
    ),
  createSession: (value) =>
    localTransaction((s) => {
      s.sessions.push(value);
    }),
  deleteSession: (hash) =>
    localTransaction((s) => {
      s.sessions = s.sessions.filter((v) => v.session_hash !== hash);
    }),
  documents: (id) =>
    localTransaction((s) => s.documents.filter((d) => d.appointment_id === id)),
  document: (id) =>
    localTransaction((s) => s.documents.find((d) => d.id === id) || null),
  saveDocument: (record, bytes) => persistDocument(record, bytes),
  saveClinicDocument: (record, bytes, actor) =>
    persistDocument(record, bytes, actor),
  submitClinic: (id, actor) =>
    localTransaction((s) => {
      if (!s.staff.some((v) => v.id === actor && v.status === "active"))
        throw new Error("STAFF_REQUIRED");
      const a = s.appointments.find((v) => v.id === id);
      if (
        !a ||
        a.status !== "invited" ||
        !s.documents.some((d) => d.appointment_id === id)
      )
        return false;
      a.status = "submitted";
      a.submitted_at = new Date().toISOString();
      s.audit.push({
        event: "staff_documents_submitted",
        actor_id: actor,
        appointment_id: id,
        at: a.submitted_at,
      });
      return true;
    }),
  async readDocument(record) {
    if (!localTestMode()) throw new Error("LOCAL_STORE_DISABLED");
    return readFile(
      /* turbopackIgnore: true */ path.join(
        /* turbopackIgnore: true */ root(),
        record.storage_path,
      ),
    );
  },
  submit: (id) =>
    localTransaction((s) => {
      const a = s.appointments.find((a) => a.id === id);
      if (
        !a ||
        !active(a) ||
        a.status !== "invited" ||
        !s.documents.some((d) => d.appointment_id === id)
      )
        return false;
      a.status = "submitted";
      a.submitted_at = new Date().toISOString();
      s.audit.push({
        event: "documents_submitted",
        appointment_id: id,
        at: a.submitted_at,
      });
      return true;
    }),
  async deleteAppointment(id, actor, confirmation) {
    const docs = await localTransaction((s) => {
      if (!s.staff.some((v) => v.id === actor && v.status === "active"))
        throw new Error("STAFF_REQUIRED");
      const a = s.appointments.find((v) => v.id === id);
      if (!a) return null;
      if (a.patient_label !== confirmation)
        throw new Error("CONFIRMATION_MISMATCH");
      if (!a.deletion_requested_at)
        s.audit.push({
          event: "patient_card_deletion_requested",
          actor_id: actor,
          appointment_id: id,
          at: new Date().toISOString(),
        });
      a.deletion_requested_at ||= new Date().toISOString();
      a.revoked_at ||= a.deletion_requested_at;
      s.sessions = s.sessions.filter((v) => v.appointment_id !== id);
      const deliveryIds = s.reportDeliveries
        .filter((d) => d.appointment_id === id)
        .map((d) => d.id);
      s.recordVersions = s.recordVersions.filter(
        (v) => v.appointment_id !== id,
      );
      s.reportApprovals = s.reportApprovals.filter(
        (v) => v.appointment_id !== id,
      );
      s.reportDeliveries = s.reportDeliveries.filter(
        (v) => v.appointment_id !== id,
      );
      s.patientDraftJobs = s.patientDraftJobs.filter(
        (v) => v.appointment_id !== id,
      );
      s.visitWorkspaces = s.visitWorkspaces.filter(
        (v) => v.appointment_id !== id,
      );
      s.reportAttempts = s.reportAttempts.filter(
        (v) => !deliveryIds.includes(v.delivery_id),
      );
      s.reportChallenges = s.reportChallenges.filter(
        (v) => !deliveryIds.includes(v.delivery_id),
      );
      s.reportSessions = s.reportSessions.filter(
        (v) => !deliveryIds.includes(v.delivery_id),
      );
      s.evidenceReviews = s.evidenceReviews.filter(
        (v) => v.appointment_id !== id,
      );
      s.analyses = s.analyses.filter((v) => v.appointment_id !== id);
      s.presentations = s.presentations.filter((v) => v.appointment_id !== id);
      return s.documents.filter((v) => v.appointment_id === id);
    });
    if (!docs) return false;
    try {
      for (const d of docs) {
        const file = path.resolve(
          /* turbopackIgnore: true */ root(),
          d.storage_path,
        );
        if (!file.startsWith(root() + path.sep))
          throw new Error("UNSAFE_STORAGE_PATH");
        try {
          await unlink(/* turbopackIgnore: true */ file);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    } catch {
      throw new PortalError(
        503,
        "DELETION_PENDING",
        "המחיקה לא הושלמה. התיק חסום לגישה; אפשר לנסות שוב כדי להשלים את הסרת הקבצים.",
      );
    }
    return localTransaction((s) => {
      s.appointments = s.appointments.filter((v) => v.id !== id);
      s.documents = s.documents.filter((v) => v.appointment_id !== id);
      s.audit.push({
        event: "patient_card_deleted",
        actor_id: actor,
        appointment_id: id,
        at: new Date().toISOString(),
      });
      return true;
    });
  },
  revoke: (id) =>
    localTransaction((s) => {
      const a = s.appointments.find((a) => a.id === id);
      if (a) {
        a.revoked_at = new Date().toISOString();
        s.sessions = s.sessions.filter((v) => v.appointment_id !== id);
        s.audit.push({
          event: "invitation_revoked",
          appointment_id: id,
          at: a.revoked_at,
        });
      }
    }),
  rename: (id, label, previous) =>
    localTransaction((s) => {
      const a = s.appointments.find((v) => v.id === id);
      if (!a || a.deletion_requested_at || a.patient_label !== previous)
        return false;
      a.patient_label = label;
      return true;
    }),
  review: (id) =>
    localTransaction((s) => {
      const a = s.appointments.find((a) => a.id === id);
      if (a?.status === "submitted") {
        a.status = "reviewed";
        s.audit.push({
          event: "appointment_reviewed",
          appointment_id: id,
          at: new Date().toISOString(),
        });
      }
    }),
  audit: (value) =>
    localTransaction((s) => {
      s.audit.push({ ...value, at: new Date().toISOString() });
    }),
};
