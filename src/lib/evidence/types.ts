import type {
  Bilingual,
  ClinicalFact,
  ClinicalSource,
  ClinicalSummary,
} from "@/lib/clinical/types";
export type PatientFact = {
  id: number;
  kind: string;
  basis: "documented" | "patient_reported" | "interpretation";
  fact: ClinicalFact;
};
export type PatientContext = {
  summary: ClinicalSummary;
  documents: ClinicalSource[];
  facts: PatientFact[];
};
export type LiteratureSource = {
  id: string;
  title: string;
  authors: string[];
  date: string;
  journal: string;
  organisation: string;
  url: string;
  doi_url: string;
  evidence_type: string;
  access: "abstract_only" | "full_text_excerpts" | "metadata_only";
  text: string;
  retrieved_at: string;
  topics: string[];
  relevance: number;
};
export type SearchRun = {
  query: string;
  database: string;
  retrieved_at: string;
  count: number;
  failure: string;
};
export type Retrieval = {
  sources: LiteratureSource[];
  searches: SearchRun[];
  limitations: string[];
  topics: string[];
};
export type EvidenceClaim = {
  section:
    "options" | "guidelines" | "cases" | "uncertainties" | "proposed_plan";
  stance: "support" | "concern" | "alternative" | "question" | "context";
  title: Bilingual;
  text: Bilingual;
  patient_fact_ids: number[];
  refs: { source_id: string; quote: string }[];
  recommendation_class: string;
  evidence_level: string;
};
export type EvidenceReport = {
  claims: EvidenceClaim[];
  omitted_claims: number;
  omitted_patient_facts: number;
  incomplete: boolean;
};
export type EvidenceRecord = {
  id: string;
  appointment_id: string;
  created_by: string | null;
  document_version: string;
  status: "processing" | "ready" | "failed";
  stage:
    "analysing" | "searching" | "verifying" | "writing" | "complete" | "failed";
  question: string;
  question_kind: "question" | "plan";
  context: PatientContext | null;
  retrieval: Retrieval | null;
  report: EvidenceReport | null;
  created_at: string;
  completed_at: string | null;
  searched_at: string | null;
  lease_until: string;
  error_code: string | null;
  model: string | null;
};
