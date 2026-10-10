import "server-only";
import { latestMedicalImport } from "@/lib/medical-import/store";
import {
  importedVersion,
  importedEvidenceContext,
} from "@/lib/medical-import/evidence";
import { PDFDocument } from "pdf-lib";
import { getStore } from "@/lib/portal/store";
import { hash } from "@/lib/portal/security";
import { clinicalStore } from "@/lib/clinical/store";
import {
  requestClinicalSummary,
  providerConfigured,
} from "@/lib/clinical/provider";
import { personalClaudeConfigured } from "@/lib/medical-import/engine";
import { instructions } from "@/lib/clinical/engine";
import { validateSummary } from "@/lib/clinical/schema";
import fixtures from "@/lib/test-documents.json";
import type { ClinicalSource } from "@/lib/clinical/types";
import type { PatientContext, PatientFact } from "./types";
export async function documentVersion(id: string) {
  const imported = await latestMedicalImport(id);
  if (imported)
    return {
      docs: [],
      version: importedVersion(imported),
      hasSources:
        imported.status === "ready" &&
        Boolean(imported.summary) &&
        imported.ai_consent,
    };
  const docs = (await getStore().documents(id)).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return {
    docs,
    hasSources: docs.length > 0,
    version: hash(
      JSON.stringify(docs.map((d) => ({ id: d.id, hash: d.sha256 }))),
    ),
  };
}
export async function readEvidenceContext(id: string, version: string) {
  if (await latestMedicalImport(id))
    return importedEvidenceContext(id, version);
  const { docs, version: current } = await documentVersion(id);
  if (current !== version || !docs.length) throw new Error("DOCUMENTS_CHANGED");
  const documents: ClinicalSource[] = [],
    content: Record<string, unknown>[] = [];
  let totalBytes = 0,
    totalPages = 0;
  for (let i = 0; i < docs.length; i++) {
    const bytes = await getStore().readDocument(docs[i]),
      digest = hash(bytes);
    if (digest !== docs[i].sha256 || !fixtures.some((f) => f.sha256 === digest))
      throw new Error("TEST_DOCUMENT_ONLY");
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    totalBytes += bytes.length;
    totalPages += pages;
    if (totalBytes > 20 * 1024 * 1024 || totalPages > 100)
      throw new Error("SOURCE_LIMIT");
    documents.push({
      document_id: docs[i].id,
      filename: docs[i].filename,
      sha256: digest,
      pages,
    });
    content.push(
      {
        type: "input_text",
        text:
          "UNTRUSTED FICTIONAL SOURCE " +
          JSON.stringify({ document_id: docs[i].id, pages }),
      },
      {
        type: "input_file",
        filename: "source-" + (i + 1) + ".pdf",
        file_data: "data:application/pdf;base64," + bytes.toString("base64"),
      },
    );
  }
  const existing = await clinicalStore().get(id);
  const summary =
    existing?.status === "ready" &&
    existing.source_hash === version &&
    existing.summary
      ? validateSummary(existing.summary, documents)
      : validateSummary(
          (await requestClinicalSummary(instructions, content, 80000)).value,
          documents,
        );
  const facts: PatientFact[] = [
    {
      id: 0,
      kind: "overview",
      basis: "interpretation",
      fact: summary.overview,
    },
  ];
  for (const section of summary.sections)
    for (const fact of section.items) {
      const text =
        fact.text.en +
        " " +
        fact.text.he +
        " " +
        fact.refs.map((r) => r.quote).join(" ");
      const basis =
        /patient reports|patient-reported|לדבריו|לדבריה|מדווח|תלונות|reports .*symptoms/i.test(
          text,
        )
          ? "patient_reported"
          : /suggests|possible|suspected|may indicate|ייתכן|חשד|אפשרי/i.test(
                text,
              )
            ? "interpretation"
            : "documented";
      facts.push({ id: facts.length, kind: section.kind, basis, fact });
    }
  if (!facts.length)
    facts.push({
      id: 0,
      kind: "overview",
      basis: "interpretation",
      fact: summary.overview,
    });
  for (const fact of summary.conflicts)
    facts.push({
      id: facts.length,
      kind: "conflict",
      basis: "interpretation",
      fact,
    });
  const context: PatientContext = { summary, documents, facts };
  return { context, content };
}

export async function scopedProviderConfigured(id: string) {
  const imported = await latestMedicalImport(id);
  return imported
    ? imported.ai_consent && personalClaudeConfigured()
    : providerConfigured();
}
