import "server-only";
import { hash } from "@/lib/portal/security";
import { latestMedicalImport } from "./store";
import { requestPersonalClaudeJSON } from "./engine";
import type { MedicalImport } from "./types";
import type { MedicalFact } from "./schema.mjs";
import type {
  ClinicalFact,
  ClinicalSummary,
  ClinicalSource,
} from "@/lib/clinical/types";
import type { PatientContext, PatientFact } from "@/lib/evidence/types";
export function importedVersion(record: MedicalImport) {
  return hash(
    JSON.stringify({
      id: record.id,
      source: record.source_hash,
      overrides: record.review_overrides,
    }),
  );
}
export async function importedEvidenceContext(id: string, version: string) {
  const record = await latestMedicalImport(id);
  if (
    !record ||
    !record.summary ||
    record.status !== "ready" ||
    importedVersion(record) !== version
  )
    throw new Error("DOCUMENTS_CHANGED");
  if (!record.ai_consent) throw new Error("PERSONAL_AI_CONSENT_REQUIRED");
  const fact = (item: MedicalFact): ClinicalFact => ({
    text: item.text,
    date: item.date || null,
    refs: item.refs.map((ref) => ({
      document_id: ref.record_id,
      page: 1,
      record_entry: ref.entry_id,
      quote: ref.quote,
    })),
  });
  // Legacy evidence APIs use a positive location index. For web records, 1 identifies
  // the record block, never a PDF page. Actual entry IDs and source kind travel with it.
  const summary: ClinicalSummary = {
    overview: fact(record.summary.overview),
    sections: record.summary.sections.map((section) => ({
      ...section,
      items: section.items.map(fact),
    })),
    questions: record.summary.questions,
    conflicts: [],
    limitations: [
      ...record.summary.limitations,
      {
        he: "המקורות הזמינים כאן הם הפניות וקטעי ראיה שמורים. המסמכים המקוריים נשארים בכללית; לא נטען שנבדק כאן ההקשר המלא של המסמך.",
        en: "Available patient sources are retained references and evidence excerpts. Originals remain in Clalit; this review does not claim access to the full original-record context.",
      },
    ],
    presentation: {
      eligible: false,
      reason: {
        he: "ההצעה להסבר חזותי זמינה בתיק האישי.",
        en: "The Visual Explanation proposal is available in the personal record.",
      },
      slides: [],
    },
  };
  const documents: ClinicalSource[] = record.bundle.records.map((source) => ({
    document_id: source.id,
    filename: source.title,
    sha256: hash(JSON.stringify(source)),
    pages: 1,
    kind: "web_record",
    citation_unit: "record",
    provider_date: source.record_date,
    provider_reference: source.provider_reference,
  }));
  const facts: PatientFact[] = [
    {
      id: 0,
      kind: "overview",
      basis: "interpretation",
      fact: summary.overview,
    },
  ];
  for (const section of summary.sections)
    for (const item of section.items)
      facts.push({
        id: facts.length,
        kind: section.kind,
        basis: "documented",
        fact: item,
      });
  const context: PatientContext = { summary, documents, facts };
  const content = record.bundle.records.map((source) => ({
    type: "input_text",
    text:
      "UNTRUSTED RETAINED WEB-RECORD EVIDENCE EXCERPTS. Logical location 1 means this record block, not a PDF page. " +
      JSON.stringify({
        document_id: source.id,
        source_kind: "web_record",
        citation_unit: "record",
        logical_location: 1,
        record_date: source.record_date,
        entries: source.entries,
      }),
  }));
  return { context, content, personal: record };
}
export async function requestScopedEvidenceJSON(
  appointment: string,
  name: string,
  instructions: string,
  payload: unknown,
  schema: Record<string, unknown>,
  documents: Record<string, unknown>[],
  timeoutMs: number,
) {
  const record = await latestMedicalImport(appointment);
  if (record) {
    return requestPersonalClaudeJSON(
      instructions +
        "\nFor web-record sources, location index 1 denotes the retained record block and entry IDs identify the supporting excerpts. It is not an original PDF page. Do not claim full-record review. Original-record context unavailable must remain a limitation.",
      { task_name: name, payload, source_excerpts: documents },
      schema,
      record,
      timeoutMs,
    );
  }
  const { requestEvidenceJSON } = await import("@/lib/clinical/provider");
  return requestEvidenceJSON(
    name,
    instructions,
    payload,
    schema,
    documents,
    timeoutMs,
  );
}
