// Shared, strict structured-record boundary. No PDF bytes, cookies, credentials or raw HTML.
export const importCategories = [
  "medical_summary",
  "laboratory",
  "visits",
  "hospitalizations",
  "diagnoses",
  "medications",
  "allergies",
  "imaging",
  "vaccinations",
  "measurements",
  "procedures",
  "other",
];
const object = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
const string = (value, max = 4000) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validateMedicalBundle(value) {
  const fail = () => {
    throw new Error("INVALID_MEDICAL_BUNDLE");
  };
  if (
    !object(value, [
      "schema_version",
      "provider",
      "subject_scope",
      "collected_at",
      "records",
      "coverage",
    ]) ||
    value.schema_version !== 1 ||
    value.provider !== "clalit" ||
    value.subject_scope !== "self" ||
    !string(value.collected_at, 40) ||
    !Number.isFinite(Date.parse(value.collected_at)) ||
    !Array.isArray(value.records) ||
    value.records.length < 1 ||
    value.records.length > 200 ||
    !Array.isArray(value.coverage) ||
    value.coverage.length > 20
  )
    fail();
  let totalEntries = 0;
  const ids = new Set();
  for (const record of value.records) {
    if (
      !object(record, [
        "id",
        "category",
        "title",
        "record_date",
        "provider_reference",
        "source_origin",
        "source_path",
        "association_verified",
        "entries",
      ]) ||
      !uuid(record.id) ||
      ids.has(record.id) ||
      !importCategories.includes(record.category) ||
      !string(record.title, 200) ||
      (record.record_date !== null && !string(record.record_date, 60)) ||
      (record.provider_reference !== null &&
        !string(record.provider_reference, 120)) ||
      !string(record.source_origin, 100) ||
      !string(record.source_path, 240) ||
      typeof record.association_verified !== "boolean" ||
      !Array.isArray(record.entries) ||
      !record.entries.length ||
      record.entries.length > 500
    )
      fail();
    let origin;
    try {
      origin = new URL(record.source_origin);
    } catch {
      fail();
    }
    if (
      origin.protocol !== "https:" ||
      (origin.hostname !== "clalit.co.il" &&
        !origin.hostname.endsWith(".clalit.co.il")) ||
      origin.origin !== record.source_origin ||
      !record.source_path.startsWith("/") ||
      /[?#]/.test(record.source_path) ||
      /[\u0000-\u001f]/.test(record.source_path)
    )
      fail();
    ids.add(record.id);
    const entries = new Set();
    for (const entry of record.entries) {
      if (
        !object(entry, ["id", "text"]) ||
        !string(entry.id, 80) ||
        !/^[a-z0-9_-]+$/i.test(entry.id) ||
        entries.has(entry.id) ||
        !string(entry.text, 8000) ||
        /<(?:script|iframe|html|body)\b/i.test(entry.text)
      )
        fail();
      entries.add(entry.id);
      totalEntries++;
    }
  }
  if (totalEntries > 3000 || JSON.stringify(value).length > 500000)
    throw new Error("MEDICAL_SOURCE_LIMIT");
  for (const item of value.coverage)
    if (
      !object(item, ["category", "status", "record_count"]) ||
      !importCategories.includes(item.category) ||
      ![
        "captured",
        "partial",
        "no_records_displayed",
        "menu_not_recognized",
        "adapter_required",
        "not_accessible",
        "not_collected",
      ].includes(item.status) ||
      !Number.isInteger(item.record_count) ||
      item.record_count < 0 ||
      item.record_count > 200
    )
      fail();
  return structuredClone(value);
}
export const medicalSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "sections",
    "questions",
    "limitations",
    "relevance",
    "visual_proposal",
  ],
  properties: {
    overview: { $ref: "#/$defs/fact" },
    sections: { type: "array", items: { $ref: "#/$defs/section" } },
    questions: { type: "array", items: { $ref: "#/$defs/bilingual" } },
    limitations: { type: "array", items: { $ref: "#/$defs/bilingual" } },
    relevance: { type: "array", items: { $ref: "#/$defs/relevance" } },
    visual_proposal: { $ref: "#/$defs/proposal" },
  },
  $defs: {
    bilingual: {
      type: "object",
      additionalProperties: false,
      required: ["he", "en"],
      properties: { he: { type: "string" }, en: { type: "string" } },
    },
    citation: {
      type: "object",
      additionalProperties: false,
      required: ["record_id", "entry_id", "quote"],
      properties: {
        record_id: { type: "string" },
        entry_id: { type: "string" },
        quote: { type: "string" },
      },
    },
    fact: {
      type: "object",
      additionalProperties: false,
      required: ["text", "date", "refs"],
      properties: {
        text: { $ref: "#/$defs/bilingual" },
        date: { type: "string" },
        refs: { type: "array", items: { $ref: "#/$defs/citation" } },
      },
    },
    section: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title", "items", "missing"],
      properties: {
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
        title: { $ref: "#/$defs/bilingual" },
        items: { type: "array", items: { $ref: "#/$defs/fact" } },
        missing: { type: "array", items: { $ref: "#/$defs/bilingual" } },
      },
    },
    relevance: {
      type: "object",
      additionalProperties: false,
      required: ["record_id", "priority", "reason", "refs"],
      properties: {
        record_id: { type: "string" },
        priority: {
          type: "string",
          enum: ["primary", "secondary", "uncertain", "deferred"],
        },
        reason: { $ref: "#/$defs/bilingual" },
        refs: { type: "array", items: { $ref: "#/$defs/citation" } },
      },
    },
    slide: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "title", "explanation", "bullets", "key_value"],
      properties: {
        kind: {
          type: "string",
          enum: ["pumping", "coronary", "stent", "valve", "rhythm", "care"],
        },
        title: { $ref: "#/$defs/bilingual" },
        explanation: { $ref: "#/$defs/bilingual" },
        bullets: { type: "array", items: { $ref: "#/$defs/fact" } },
        key_value: { $ref: "#/$defs/bilingual" },
      },
    },
    proposal: {
      type: "object",
      additionalProperties: false,
      required: ["eligible", "reason", "slides"],
      properties: {
        eligible: { type: "boolean" },
        reason: { $ref: "#/$defs/bilingual" },
        slides: { type: "array", items: { $ref: "#/$defs/slide" } },
      },
    },
  },
};
export function validateMedicalSummary(value, bundle, overrides = {}) {
  const invalid = () => {
    throw new Error("INVALID_IMPORTED_SUMMARY");
  };
  const bilingual = (item, max = 2000) =>
    object(item, ["he", "en"]) && string(item.he, max) && string(item.en, max);
  const refs = (items) =>
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= 8 &&
    items.every((ref) => {
      if (
        !object(ref, ["record_id", "entry_id", "quote"]) ||
        !string(ref.quote, 350)
      )
        return false;
      const record = bundle.records.find(
          (source) => source.id === ref.record_id,
        ),
        entry = record?.entries.find((entry) => entry.id === ref.entry_id);
      return Boolean(entry && entry.text.includes(ref.quote));
    });
  const fact = (item) =>
    object(item, ["text", "date", "refs"]) &&
    bilingual(item.text) &&
    typeof item.date === "string" &&
    item.date.length <= 60 &&
    refs(item.refs);
  if (
    !object(value, [
      "overview",
      "sections",
      "questions",
      "limitations",
      "relevance",
      "visual_proposal",
    ]) ||
    !fact(value.overview) ||
    !Array.isArray(value.sections) ||
    value.sections.length !== 6 ||
    new Set(value.sections.map((section) => section.kind)).size !== 6
  )
    invalid();
  for (const section of value.sections)
    if (
      !object(section, ["kind", "title", "items", "missing"]) ||
      ![
        "referral",
        "history",
        "findings",
        "medications",
        "allergies",
        "plan",
      ].includes(section.kind) ||
      !bilingual(section.title, 300) ||
      !Array.isArray(section.items) ||
      section.items.length > 20 ||
      !section.items.every(fact) ||
      !Array.isArray(section.missing) ||
      section.missing.length > 10 ||
      !section.missing.every((item) => bilingual(item))
    )
      invalid();
  for (const key of ["questions", "limitations"])
    if (
      !Array.isArray(value[key]) ||
      value[key].length > 12 ||
      !value[key].every((item) => bilingual(item))
    )
      invalid();
  if (
    !Array.isArray(value.relevance) ||
    value.relevance.length !== bundle.records.length ||
    new Set(value.relevance.map((item) => item.record_id)).size !==
      bundle.records.length
  )
    invalid();
  for (const item of value.relevance) {
    if (
      !object(item, ["record_id", "priority", "reason", "refs"]) ||
      !bundle.records.some((record) => record.id === item.record_id) ||
      !["primary", "secondary", "uncertain", "deferred"].includes(
        item.priority,
      ) ||
      !bilingual(item.reason, 600) ||
      !refs(item.refs) ||
      item.refs.some((ref) => ref.record_id !== item.record_id)
    )
      invalid();
    if (overrides[item.record_id] === true && item.priority === "deferred")
      invalid();
    // Source association uncertainty cannot be silently deferred from the doctor's attention.
    if (
      !bundle.records.find((record) => record.id === item.record_id)
        .association_verified &&
      item.priority === "deferred"
    )
      invalid();
  }
  const proposal = value.visual_proposal;
  if (
    !object(proposal, ["eligible", "reason", "slides"]) ||
    typeof proposal.eligible !== "boolean" ||
    !bilingual(proposal.reason, 1000) ||
    !Array.isArray(proposal.slides) ||
    proposal.slides.length > 6 ||
    (proposal.eligible && proposal.slides.length < 1) ||
    (!proposal.eligible && proposal.slides.length)
  )
    invalid();
  for (const slide of proposal.slides)
    if (
      !object(slide, [
        "kind",
        "title",
        "explanation",
        "bullets",
        "key_value",
      ]) ||
      !["pumping", "coronary", "stent", "valve", "rhythm", "care"].includes(
        slide.kind,
      ) ||
      !bilingual(slide.title, 300) ||
      !bilingual(slide.explanation, 1800) ||
      !Array.isArray(slide.bullets) ||
      !slide.bullets.length ||
      slide.bullets.length > 6 ||
      !slide.bullets.every(fact) ||
      !object(slide.key_value, ["he", "en"]) ||
      typeof slide.key_value.he !== "string" ||
      typeof slide.key_value.en !== "string"
    )
      invalid();
  return structuredClone(value);
}

// Persist provenance first; source text remains in request/collector memory only.
export function medicalMetadataBundle(bundle) {
  return {
    ...structuredClone(bundle),
    records: bundle.records.map((record) => ({
      ...record,
      entries: [],
      entry_count: record.entries.length,
      source_content: "provenance_only",
    })),
  };
}
// Keep only exact supporting excerpts for the summary/exclusion audit, not full fetched records.
export function medicalEvidenceBundle(bundle, summary) {
  const cited = new Map();
  const facts = [
    summary.overview,
    ...summary.sections.flatMap((section) => section.items),
    ...summary.visual_proposal.slides.flatMap((slide) => slide.bullets),
  ];
  const refs = [
    ...facts.flatMap((fact) => fact.refs),
    ...summary.relevance.flatMap((item) => item.refs),
  ];
  for (const ref of refs) {
    const key = ref.record_id + ":" + ref.entry_id;
    const quotes = cited.get(key) || new Set();
    quotes.add(ref.quote);
    cited.set(key, quotes);
  }
  return {
    ...structuredClone(bundle),
    records: bundle.records.map((record) => ({
      ...record,
      entry_count: record.entries.length,
      source_content: "evidence_excerpt",
      entries: record.entries
        .filter((entry) => cited.has(record.id + ":" + entry.id))
        .map((entry) => ({
          id: entry.id,
          text: [...cited.get(record.id + ":" + entry.id)].join("\n"),
        })),
    })),
  };
}
