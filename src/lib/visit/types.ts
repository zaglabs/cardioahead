import type {
  Bilingual,
  ClinicalFact,
  ClinicalSource,
} from "@/lib/clinical/types";
import type { Retrieval } from "@/lib/evidence/types";
export const visitFields = [
  "reason",
  "findings",
  "assessment",
  "plan",
  "medications",
  "referrals",
  "follow_up",
  "warning_signs",
  "prevention",
  "additional",
] as const;
export type VisitField = (typeof visitFields)[number];
export type Findings = {
  visit_date: string;
  fields: Record<VisitField, Bilingual>;
};
export type LifestyleSection = {
  id: string;
  kind: "activity" | "nutrition" | "habits" | "monitoring" | "goals" | "other";
  title: Bilingual;
  patient_text: Bilingual;
  review_note: Bilingual;
  requires_clearance: boolean;
  facts: ClinicalFact[];
  refs: { source_id: string; quote: string }[];
  origin: "ai" | "clinician";
};
export type LifestyleContent = {
  sections: LifestyleSection[];
  limitations: Bilingual[];
};
export type CopiedRecommendation = {
  id: string;
  source_version_id: string;
  title: Bilingual;
  text: Bilingual;
};
export type ReportContent = {
  patient_name: string;
  patient_reference: string;
  visit_date: string;
  clinician_name: string;
  clinic_name: string;
  clinic_contact: string;
  fields: Record<VisitField, Bilingual>;
  lifestyle: CopiedRecommendation[];
  next_steps: Bilingual[];
};
export type LocalizedReport = {
  report_title: string;
  next_steps_title: string;
  labels: {
    patient: string;
    reference: string;
    visit_date: string;
    clinician: string;
    contact: string;
  };
  language: "en" | "he";
  patient_name: string;
  patient_reference: string;
  visit_date: string;
  clinician_name: string;
  clinic_name: string;
  clinic_contact: string;
  sections: { key: string; title: string; text: string }[];
  next_steps: string[];
};
export type SourceSnapshot = {
  documents: ClinicalSource[];
  facts: ClinicalFact[];
  retrieval: Retrieval | null;
  findings_version_id: string | null;
  copied_from: string[];
  notes: string[];
};
export type RecordVersion = {
  id: string;
  appointment_id: string;
  kind: "findings" | "lifestyle" | "summary";
  revision: number;
  data: Findings | LifestyleContent | ReportContent;
  source_snapshot: SourceSnapshot;
  document_version: string;
  origin: "ai" | "clinician" | "copied";
  created_by: string;
  author_identity: { email: string; role: string };
  created_at: string;
};
export type Approval = {
  id: string;
  appointment_id: string;
  version_id: string;
  language: "en" | "he";
  recipient: string;
  content_hash: string;
  snapshot: LocalizedReport;
  pdf_base64: string;
  pdf_sha256: string;
  approved_by: string;
  approver_identity: { email: string; role: string };
  approved_at: string;
};
export type Delivery = {
  id: string;
  appointment_id: string;
  approval_id: string;
  recipient: string;
  language: "he" | "en";
  status:
    "sending" | "accepted" | "delivered" | "failed" | "unknown" | "bounced";
  token_hash: string;
  token_encrypted: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  lease_until: string | null;
  active_attempt_id: string | null;
  provider_id: string | null;
  provider_event: string | null;
  accepted_at: string | null;
  attempts: number;
  notice_payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    link_origin?: string;
  };
  last_error: string | null;
};
export type SendAttempt = {
  id: string;
  delivery_id: string;
  actor_id: string;
  started_at: string;
  finished_at: string | null;
  status: "sending" | "accepted" | "failed" | "unknown";
  provider_id: string | null;
};
export type DraftJob = {
  id: string;
  appointment_id: string;
  kind: "lifestyle" | "summary";
  created_by: string;
  regeneration_decision: string | null;
  result_version_id: string | null;
  base_version_id: string | null;
  findings_version_id: string | null;
  document_version: string;
  status: "processing" | "ready" | "failed";
  stage: string;
  lease_until: string;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};
export type ReportChallenge = {
  id: string;
  delivery_id: string;
  code_digest: string;
  ip_hash: string;
  created_at: string;
  expires_at: string;
  attempts: number;
  delivered: boolean;
  consumed: boolean;
};
export type ReportSession = {
  session_hash: string;
  delivery_id: string;
  expires_at: string;
};
export type VisitWorkspace = {
  appointment_id: string;
  findings_id: string | null;
  lifestyle_id: string | null;
  summary_id: string | null;
  approval_id: string | null;
};
