export type InvitationLink = {
  id: string;
  appointment_id: string;
  token_hash: string;
  secret_ciphertext: string | null;
  language: "he" | "en";
  issued_by: string | null;
  issuer_label: string | null;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  deleted_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  first_verified_at: string | null;
  last_verified_at: string | null;
  clalit_connected_at: string | null;
  latest_import_at: string | null;
  last_sent_at: string | null;
  last_recipient: string | null;
  legacy: boolean;
};
export type InvitationRow = Omit<
  InvitationLink,
  "token_hash" | "secret_ciphertext" | "issued_by"
> & {
  patient_label: string;
  recoverable: boolean;
  card_deleting: boolean;
  status: "active" | "expired" | "revoked" | "deleted";
  patient_upload_count: number;
  latest_upload_at: string | null;
  card_document_count: number;
  import_status: "not_started" | "received" | "generating" | "ready" | "failed";
  import_record_count: number | null;
};
export type InvitationSend = {
  id: string;
  invitation_id: string;
  actor_id: string | null;
  recipient: string;
  status: "sending" | "accepted" | "failed" | "unknown";
  provider_id: string | null;
  created_at: string;
  accepted_at: string | null;
};
