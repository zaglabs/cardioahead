import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const js = ts.transpileModule(
  fs.readFileSync("src/lib/clinical/schema.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { validateSummary } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("clinical output rejects invented source IDs, pages and unsupported scene proposals", () => {
  const bi = { he: "בדיקה", en: "Test" },
    source = {
      document_id: "doc",
      filename: "test.pdf",
      pages: 1,
      sha256: "hash",
    };
  const fact = {
    text: bi,
    date: null,
    refs: [{ document_id: "doc", page: 1, quote: "test source" }],
  };
  const valid = {
    overview: fact,
    sections: [
      "referral",
      "history",
      "findings",
      "medications",
      "allergies",
      "plan",
    ].map((kind) => ({ kind, title: bi, items: [fact], missing: [] })),
    questions: [],
    conflicts: [],
    limitations: [],
    presentation: {
      eligible: true,
      reason: bi,
      slides: [
        {
          kind: "pumping",
          title: bi,
          explanation: bi,
          bullets: [fact],
          key_value: null,
        },
      ],
    },
  };
  assert.equal(validateSummary(valid, [source]), valid);
  const unknown = structuredClone(valid);
  unknown.overview.refs[0].document_id = "another-patient";
  assert.throws(
    () => validateSummary(unknown, [source]),
    /INVALID_SOURCE_REFERENCE/,
  );
  const page = structuredClone(valid);
  page.overview.refs[0].page = 2;
  assert.throws(
    () => validateSummary(page, [source]),
    /INVALID_SOURCE_REFERENCE/,
  );
  const unsupported = structuredClone(valid);
  unsupported.presentation.slides[0].kind = "care";
  assert.throws(
    () => validateSummary(unsupported, [source]),
    /UNSUPPORTED_PRESENTATION/,
  );
  const uncited = structuredClone(valid);
  uncited.sections[0].items[0].refs = [];
  assert.throws(() => validateSummary(uncited, [source]), /INVALID_AI_OUTPUT/);
});
