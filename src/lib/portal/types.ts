export type AppointmentStatus = "invited" | "submitted" | "reviewed";
export type StaffStatus = "pending" | "active" | "suspended" | "rejected";
export type Staff = {
  id: string;
  email: string;
  role: "admin" | "secretary" | "professor";
  status: StaffStatus;
  created_at: string;
};
export type Appointment = {
  deletion_requested_at?: string | null;
  intake_mode?: "invitation" | "clinic";
  id: string;
  patient_label: string;
  appointment_at: string | null;
  status: AppointmentStatus;
  token_hash: string;
  pin_digest: string;
  expires_at: string;
  revoked_at: string | null;
  failed_attempts: number;
  created_by: string | null;
  created_at: string;
  submitted_at: string | null;
};
export type DocumentRecord = {
  id: string;
  appointment_id: string;
  filename: string;
  storage_path: string;
  sha256: string;
  bytes: number;
  created_at: string;
};
export type PortalSession = {
  session_hash: string;
  kind: "staff" | "patient";
  staff_id: string | null;
  appointment_id: string | null;
  expires_at: string;
};
export type AuditEvent = {
  details?: Record<string, unknown>;
  event: string;
  actor_id?: string;
  appointment_id?: string;
  document_id?: string;
};
export type AppointmentView = Pick<
  Appointment,
  | "id"
  | "patient_label"
  | "appointment_at"
  | "status"
  | "expires_at"
  | "revoked_at"
  | "created_at"
  | "submitted_at"
  | "intake_mode"
  | "deletion_requested_at"
> & { documents: DocumentView[] };
export type DocumentView = Pick<
  DocumentRecord,
  "id" | "filename" | "bytes" | "created_at"
>;
