const string = { type: "string" };
const ref = (name: string) => ({ $ref: "#/$defs/" + name });
const array = (name: string) => ({ type: "array", items: ref(name) });
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
// Shared definitions and no nullable unions keep Claude's compiled grammar small.
export const claudeSummarySchema = {
  ...object({
    overview: ref("fact"),
    sections: array("section"),
    questions: array("bilingual"),
    conflicts: array("fact"),
    limitations: array("bilingual"),
    presentation: ref("proposal"),
  }),
  $defs: {
    bilingual: object({ he: string, en: string }),
    evidence: object({
      document_id: string,
      page: { type: "integer" },
      quote: string,
    }),
    fact: object({
      text: ref("bilingual"),
      date: string,
      refs: array("evidence"),
    }),
    section: object({
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
      title: ref("bilingual"),
      items: array("fact"),
      missing: array("bilingual"),
    }),
    slide: object({
      kind: {
        type: "string",
        enum: ["pumping", "coronary", "stent", "valve", "rhythm", "care"],
      },
      title: ref("bilingual"),
      explanation: ref("bilingual"),
      bullets: array("fact"),
      key_value: ref("bilingual"),
    }),
    proposal: object({
      eligible: { type: "boolean" },
      reason: ref("bilingual"),
      slides: array("slide"),
    }),
  },
};
export function normalizeClaudeSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeClaudeSummary);
  if (value && typeof value === "object") {
    const object = Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, normalizeClaudeSummary(v)]),
    );
    if (Object.hasOwn(object, "date") && object.date === "") object.date = null;
    const key = object.key_value as { he?: unknown; en?: unknown } | undefined;
    if (key && key.he === "" && key.en === "") object.key_value = null;
    return object;
  }
  return value;
}
