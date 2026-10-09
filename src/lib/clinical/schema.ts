import type { ClinicalSummary, ClinicalSource } from "./types";
const str = { type: "string", minLength: 1, maxLength: 3000 };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items: unknown, maxItems = 20) => ({
  type: "array",
  items,
  maxItems,
});
const bi = obj({ he: str, en: str });
const evidence = obj({
  document_id: { type: "string" },
  page: { type: "integer", minimum: 1 },
  quote: { type: "string", minLength: 1, maxLength: 350 },
});
const fact = obj({
  text: bi,
  date: { type: ["string", "null"] },
  refs: { ...list(evidence, 8), minItems: 1 },
});
export const summarySchema = obj({
  overview: fact,
  sections: {
    ...list(
      obj({
        kind: {
          type: "string",
          enum: [
            "referral",
            "history",
            "findings",
            "medications",
            "allergies",
            "plan",
          ],
        },
        title: bi,
        items: list(fact, 20),
        missing: list(bi, 10),
      }),
      6,
    ),
    minItems: 6,
  },
  questions: list(bi, 10),
  conflicts: list(fact, 10),
  limitations: list(bi, 10),
  presentation: obj({
    eligible: { type: "boolean" },
    reason: bi,
    slides: list(
      obj({
        kind: {
          type: "string",
          enum: ["pumping", "coronary", "stent", "valve", "rhythm", "care"],
        },
        title: bi,
        explanation: bi,
        bullets: { ...list(fact, 6), minItems: 1 },
        key_value: { anyOf: [bi, { type: "null" }] },
      }),
      6,
    ),
  }),
});
type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  anyOf?: Schema[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};
function matches(value: unknown, s: Schema): boolean {
  if (s.anyOf) return s.anyOf.some((v) => matches(value, v));
  const kind =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : typeof value === "number" && Number.isInteger(value)
          ? "integer"
          : typeof value;
  const expected = Array.isArray(s.type) ? s.type : [s.type];
  if (!expected.includes(kind)) return false;
  if (s.enum && !s.enum.includes(value as string)) return false;
  if (kind === "string")
    return (
      (value as string).length >= (s.minLength ?? 0) &&
      (value as string).length <= (s.maxLength ?? 10000)
    );
  if (kind === "integer") return (value as number) >= (s.minimum ?? -Infinity);
  if (kind === "array") {
    const a = value as unknown[];
    return (
      a.length >= (s.minItems ?? 0) &&
      a.length <= (s.maxItems ?? 100) &&
      a.every((v) => matches(v, s.items!))
    );
  }
  if (kind === "object") {
    const o = value as Record<string, unknown>;
    return (
      (s.required || []).every((k) => Object.hasOwn(o, k)) &&
      Object.keys(o).every(
        (k) => s.properties?.[k] && matches(o[k], s.properties[k]),
      )
    );
  }
  return true;
}
export function validateSummary(
  value: unknown,
  sources: ClinicalSource[],
): ClinicalSummary {
  if (!matches(value, summarySchema as Schema))
    throw new Error("INVALID_AI_OUTPUT");
  const summary = value as ClinicalSummary;
  const kinds = new Set(summary.sections.map((s) => s.kind));
  if (kinds.size !== 6) throw new Error("INVALID_AI_OUTPUT");
  const facts = [
    summary.overview,
    ...summary.sections.flatMap((s) => s.items),
    ...summary.conflicts,
    ...summary.presentation.slides.flatMap((s) => s.bullets),
  ];
  for (const fact of facts)
    for (const ref of fact.refs) {
      const doc = sources.find((s) => s.document_id === ref.document_id);
      if (!doc || ref.page > doc.pages)
        throw new Error("INVALID_SOURCE_REFERENCE");
    }
  if (
    summary.presentation.eligible &&
    (!summary.presentation.slides.length ||
      summary.presentation.slides.every((s) => s.kind === "care"))
  )
    throw new Error("UNSUPPORTED_PRESENTATION");
  return summary;
}
