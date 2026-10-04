import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { MAX_DOCUMENTS, localTestMode } from "./config";
import type { PortalStore } from "./store";
import type {
  Appointment,
  DocumentRecord,
  PortalSession,
  AuditEvent,
} from "./types";
type State = {
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
async function transaction<T>(
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
  Boolean(a && !a.revoked_at && Date.parse(a.expires_at) > Date.now());
const testStaff = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "tester@cardioahead.local",
  role: "admin" as const,
};
export const localStore: PortalStore = {
  async staff(id) {
    return id === testStaff.id ? testStaff : null;
  },
  async staffByEmail(email) {
    return email === testStaff.email ? testStaff : null;
  },
  appointment: (id) =>
    transaction((s) => s.appointments.find((a) => a.id === id) || null),
  appointments: () => transaction((s) => [...s.appointments].reverse()),
  createAppointment: (a) =>
    transaction((s) => {
      s.appointments.push(a);
      s.audit.push({
        event: "invitation_created",
        appointment_id: a.id,
        actor_id: a.created_by,
        at: new Date().toISOString(),
      });
    }),
  verifyPatient: (tokenHash, digest, session) =>
    transaction((s) => {
      const a = s.appointments.find((a) => a.token_hash === tokenHash);
      if (!a || !active(a) || a.failed_attempts >= 5) return false;
      if (a.pin_digest !== digest) {
        a.failed_attempts++;
        return false;
      }
      a.failed_attempts = 0;
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
    transaction((s) => s.sessions.find((v) => v.session_hash === hash) || null),
  createSession: (value) =>
    transaction((s) => {
      s.sessions.push(value);
    }),
  deleteSession: (hash) =>
    transaction((s) => {
      s.sessions = s.sessions.filter((v) => v.session_hash !== hash);
    }),
  documents: (id) =>
    transaction((s) => s.documents.filter((d) => d.appointment_id === id)),
  document: (id) =>
    transaction((s) => s.documents.find((d) => d.id === id) || null),
  saveDocument: (record, bytes) =>
    transaction(async (s) => {
      const a = s.appointments.find((a) => a.id === record.appointment_id);
      if (!a || !active(a) || a.status !== "invited")
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
      s.documents.push(record);
      s.audit.push({
        event: "document_uploaded",
        appointment_id: a.id,
        document_id: record.id,
        at: new Date().toISOString(),
      });
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
    transaction((s) => {
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
  revoke: (id) =>
    transaction((s) => {
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
  review: (id) =>
    transaction((s) => {
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
    transaction((s) => {
      s.audit.push({ ...value, at: new Date().toISOString() });
    }),
};
