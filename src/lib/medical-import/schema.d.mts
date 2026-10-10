export type ImportCategory =
  | "medical_summary"
  | "laboratory"
  | "visits"
  | "hospitalizations"
  | "diagnoses"
  | "medications"
  | "allergies"
  | "imaging"
  | "vaccinations"
  | "measurements"
  | "procedures"
  | "other";
export type MedicalRecord = {
  entry_count?: number;
  source_content?: "provenance_only" | "evidence_excerpt";
  id: string;
  category: ImportCategory;
  title: string;
  record_date: string | null;
  provider_reference: string | null;
  source_origin: string;
  source_path: string;
  association_verified: boolean;
  entries: { id: string; text: string }[];
};
export type MedicalBundle = {
  schema_version: 1;
  provider: "clalit";
  subject_scope: "self";
  collected_at: string;
  records: MedicalRecord[];
  coverage: {
    category: ImportCategory;
    status:
      | "captured"
      | "partial"
      | "no_records_displayed"
      | "menu_not_recognized"
      | "adapter_required"
      | "not_accessible"
      | "not_collected";
    record_count: number;
  }[];
};
export type Bilingual = { he: string; en: string };
export type RecordCitation = {
  record_id: string;
  entry_id: string;
  quote: string;
};
export type MedicalFact = {
  text: Bilingual;
  date: string;
  refs: RecordCitation[];
};
export type MedicalSlide = {
  kind: "pumping" | "coronary" | "stent" | "valve" | "rhythm" | "care";
  title: Bilingual;
  explanation: Bilingual;
  bullets: MedicalFact[];
  key_value: Bilingual;
};
export type MedicalSummary = {
  overview: MedicalFact;
  sections: {
    kind:
      | "referral"
      | "history"
      | "findings"
      | "medications"
      | "allergies"
      | "plan";
    title: Bilingual;
    items: MedicalFact[];
    missing: Bilingual[];
  }[];
  questions: Bilingual[];
  limitations: Bilingual[];
  relevance: {
    record_id: string;
    priority: "primary" | "secondary" | "uncertain" | "deferred";
    reason: Bilingual;
    refs: RecordCitation[];
  }[];
  visual_proposal: {
    eligible: boolean;
    reason: Bilingual;
    slides: MedicalSlide[];
  };
};
export const importCategories: ImportCategory[];
export const medicalSummarySchema: Record<string, unknown>;
export function validateMedicalBundle(value: unknown): MedicalBundle;
export function validateMedicalSummary(
  value: unknown,
  bundle: MedicalBundle,
  overrides?: Record<string, boolean>,
): MedicalSummary;

export function medicalMetadataBundle(bundle: MedicalBundle): MedicalBundle;
export function medicalEvidenceBundle(
  bundle: MedicalBundle,
  summary: MedicalSummary,
): MedicalBundle;
