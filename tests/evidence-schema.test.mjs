import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function("module", "exports", output)(
    fixtureModule,
    fixtureModule.exports,
  );
  return fixtureModule.exports;
}
const { validateClaims, verifiedIndices } = load("src/lib/evidence/schema.ts");
const { buildQueries, searchTopics } = load("src/lib/evidence/queries.ts");
const fact = {
  text: {
    en: "Documented heart failure with uncertain allergy history",
    he: "אי ספיקת לב מתועדת",
  },
  refs: [{ document_id: "doc", page: 1, quote: "synthetic clinical quote" }],
  date: null,
};
const context = {
  facts: [{ id: 0, kind: "findings", basis: "documented", fact }],
  summary: { conflicts: [fact] },
};
const passage =
  "In this synthetic guideline, treatment depends on renal function and potassium.";
const retrieval = {
  sources: [
    {
      id: "PMID:1",
      access: "abstract_only",
      text: passage,
      evidence_type: "guideline",
    },
  ],
};
const claim = {
  section: "options",
  stance: "context",
  title: { en: "Assess applicability", he: "בירור התאמה" },
  text: {
    en: "Discuss renal function and potassium before assessing applicability.",
    he: "יש לברר תפקוד כליות ואשלגן לפני הערכת התאמה.",
  },
  patient_fact_ids: [0],
  refs: [{ source_id: "PMID:1", quote: passage }],
  recommendation_class: "",
  evidence_level: "",
};
test("controlled queries never include clinician input or identifiers, including uncommon conditions", () => {
  const topics = searchTopics(
    context,
    "Jane Doe 123456789 jane@example.com +972-555-5555: possible cardiac sarcoidosis",
  );
  assert.ok(topics.includes("cardiac_sarcoidosis"));
  const queries = buildQueries(topics).join(" ");
  for (const word of [
    "Jane",
    "123456789",
    "jane@example.com",
    "+972",
    "synthetic clinical quote",
  ])
    assert.equal(queries.includes(word), false);
  assert.ok(queries.includes("cardiac sarcoidosis"));
  assert.ok(queries.includes("Case Reports"));
  assert.deepEqual(buildQueries(["invented_patient_term"]), []);
});
test("claims require exact passages and valid patient links; metadata, titles and invented classes are rejected", () => {
  assert.equal(
    validateClaims({ claims: [claim] }, context, retrieval, false).claims
      .length,
    1,
  );
  for (const broken of [
    { ...claim, refs: [{ source_id: "PMID:404", quote: passage }] },
    {
      ...claim,
      refs: [
        {
          source_id: "PMID:1",
          quote:
            "An invented guideline recommendation not found in the retrieved passage.",
        },
      ],
    },
    { ...claim, patient_fact_ids: [999] },
    { ...claim, section: "guidelines", recommendation_class: "Class I" },
    { ...claim, section: "cases" },
  ])
    assert.equal(
      validateClaims({ claims: [broken] }, context, retrieval, false).omitted,
      1,
    );
  assert.equal(
    validateClaims(
      { claims: [claim] },
      context,
      { sources: [{ ...retrieval.sources[0], access: "metadata_only" }] },
      false,
    ).claims.length,
    0,
  );
});
test("independent verification must cover every claim; contradictions and unsupported interpretations can be rejected", () => {
  assert.deepEqual(
    [
      ...verifiedIndices(
        {
          results: [
            { index: 0, supported: false },
            { index: 1, supported: true },
          ],
        },
        2,
      ),
    ],
    [1],
  );
  assert.throws(() =>
    verifiedIndices({ results: [{ index: 0, supported: true }] }, 2),
  );
  assert.throws(() =>
    verifiedIndices(
      {
        results: [
          { index: 0, supported: true },
          { index: 0, supported: true },
        ],
      },
      2,
    ),
  );
  assert.equal(
    validateClaims(
      { claims: [{ ...claim, section: "proposed_plan" }] },
      context,
      retrieval,
      false,
    ).claims.length,
    0,
  );
});
