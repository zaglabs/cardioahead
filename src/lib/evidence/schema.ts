import type { EvidenceClaim, PatientContext, Retrieval } from "./types";
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" },
  bi = obj({ he: str, en: str });
const list = (items: unknown) => ({ type: "array", items });
export const evidenceSchema = obj({
  claims: list(
    obj({
      section: {
        type: "string",
        enum: [
          "options",
          "guidelines",
          "cases",
          "uncertainties",
          "proposed_plan",
        ],
      },
      stance: {
        type: "string",
        enum: ["support", "concern", "alternative", "question", "context"],
      },
      title: bi,
      text: bi,
      patient_fact_ids: list({ type: "integer" }),
      refs: list(obj({ source_id: str, quote: str })),
      recommendation_class: str,
      evidence_level: str,
    }),
  ),
});
export const verificationSchema = obj({
  patient_results: list(
    obj({ index: { type: "integer" }, supported: { type: "boolean" } }),
  ),
  results: list(
    obj({
      index: { type: "integer" },
      supported: { type: "boolean" },
    }),
  ),
});
export const normalizeText = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();
const validBi = (v: unknown, max: number) => {
  const b = v as { he?: unknown; en?: unknown } | null;
  return Boolean(
    b &&
    typeof b.he === "string" &&
    typeof b.en === "string" &&
    b.he.trim() &&
    b.en.trim() &&
    b.he.length <= max &&
    b.en.length <= max,
  );
};
export function validateClaims(
  value: unknown,
  context: PatientContext,
  retrieval: Retrieval,
  plan: boolean,
) {
  const all = (value as { claims?: unknown[] })?.claims;
  if (!Array.isArray(all) || all.length > 30)
    throw new Error("INVALID_EVIDENCE_OUTPUT");
  let omitted = 0;
  const claims: EvidenceClaim[] = [];
  for (const raw of all) {
    const c = raw as EvidenceClaim;
    if (
      !c ||
      ![
        "options",
        "guidelines",
        "cases",
        "uncertainties",
        "proposed_plan",
      ].includes(c.section) ||
      (!plan && c.section === "proposed_plan") ||
      !["support", "concern", "alternative", "question", "context"].includes(
        c.stance,
      ) ||
      !validBi(c.title, 200) ||
      !validBi(c.text, 2200) ||
      !Array.isArray(c.patient_fact_ids) ||
      c.patient_fact_ids.length > 8 ||
      !c.patient_fact_ids.every(
        (n) => Number.isInteger(n) && context.facts.some((f) => f.id === n),
      ) ||
      !Array.isArray(c.refs) ||
      c.refs.length > 4 ||
      !c.refs.every((r) => {
        const source = retrieval.sources.find((s) => s.id === r.source_id);
        return (
          source &&
          source.access !== "metadata_only" &&
          typeof r.quote === "string" &&
          normalizeText(r.quote).length >= 30 &&
          r.quote.length <= 450 &&
          normalizeText(source.text).includes(normalizeText(r.quote))
        );
      }) ||
      (c.section !== "uncertainties" &&
        (!c.refs.length || !c.patient_fact_ids.length)) ||
      typeof c.recommendation_class !== "string" ||
      typeof c.evidence_level !== "string" ||
      c.recommendation_class.length > 40 ||
      c.evidence_level.length > 40
    ) {
      omitted++;
      continue;
    }
    const quoted = c.refs.map((r) => normalizeText(r.quote)).join(" ");
    if (
      (c.recommendation_class &&
        (c.section !== "guidelines" ||
          !quoted.includes(normalizeText(c.recommendation_class)))) ||
      (c.evidence_level &&
        (c.section !== "guidelines" ||
          !quoted.includes(normalizeText(c.evidence_level))))
    ) {
      omitted++;
      continue;
    }
    // Literature-based claims are never accepted from titles or snippets.
    if (
      c.section === "cases" &&
      !c.refs.some(
        (r) =>
          retrieval.sources.find((s) => s.id === r.source_id)?.evidence_type ===
          "case_report_or_series",
      )
    ) {
      omitted++;
      continue;
    }
    claims.push(c);
  }
  return { claims, omitted };
}
export function verifiedIndices(value: unknown, count: number) {
  const rows = (value as { results?: { index: number; supported: boolean }[] })
    ?.results;
  if (!Array.isArray(rows) || rows.length !== count)
    throw new Error("EVIDENCE_VERIFICATION_FAILED");
  const seen = new Set<number>(),
    accepted = new Set<number>();
  for (const row of rows) {
    if (
      !Number.isInteger(row.index) ||
      row.index < 0 ||
      row.index >= count ||
      seen.has(row.index) ||
      typeof row.supported !== "boolean"
    )
      throw new Error("EVIDENCE_VERIFICATION_FAILED");
    seen.add(row.index);
    if (row.supported) accepted.add(row.index);
  }
  return accepted;
}
