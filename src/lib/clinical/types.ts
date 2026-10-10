export type Bilingual = { he: string; en: string };
export type Evidence = {
  document_id: string;
  page: number;
  quote: string;
  record_entry?: string;
};
export type ClinicalFact = {
  text: Bilingual;
  date: string | null;
  refs: Evidence[];
};
export type SectionKind =
  "referral" | "history" | "findings" | "medications" | "allergies" | "plan";
export type SceneKind =
  "pumping" | "coronary" | "stent" | "valve" | "rhythm" | "care";
export type ClinicalSlide = {
  kind: SceneKind;
  title: Bilingual;
  explanation: Bilingual;
  bullets: ClinicalFact[];
  key_value: Bilingual | null;
};
export type ClinicalSummary = {
  overview: ClinicalFact;
  sections: {
    kind: SectionKind;
    title: Bilingual;
    items: ClinicalFact[];
    missing: Bilingual[];
  }[];
  questions: Bilingual[];
  conflicts: ClinicalFact[];
  limitations: Bilingual[];
  presentation: {
    eligible: boolean;
    reason: Bilingual;
    slides: ClinicalSlide[];
  };
};
export type ClinicalSource = {
  kind?: "web_record";
  citation_unit?: "record";
  provider_date?: string | null;
  provider_reference?: string | null;
  document_id: string;
  filename: string;
  sha256: string;
  pages: number;
};
export type AnalysisRecord = {
  appointment_id: string;
  status: "queued" | "generating" | "ready" | "failed";
  source_hash: string | null;
  sources: ClinicalSource[];
  summary: ClinicalSummary | null;
  model: string | null;
  attempts: number;
  lease_token: string | null;
  lease_until: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
export type PresentationRecord = {
  id: string;
  appointment_id: string;
  source_hash: string;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  content: {
    renderer_version: 1;
    title: Bilingual;
    slides: ClinicalSlide[];
    sources: ClinicalSource[];
  };
};
