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

const errorJS = ts.transpileModule(
  fs.readFileSync("src/lib/clinical/errors.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { classifyProviderFailure } = await import(
  "data:text/javascript;base64," + Buffer.from(errorJS).toString("base64")
);
test("provider failures distinguish API credits, authentication, model and request format", () => {
  assert.equal(
    classifyProviderFailure(400, {
      error: {
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    }),
    "AI_CREDITS_REQUIRED",
  );
  assert.equal(
    classifyProviderFailure(401, { error: { message: "invalid x-api-key" } }),
    "AI_KEY_INVALID",
  );
  assert.equal(
    classifyProviderFailure(404, { error: { message: "model not found" } }),
    "AI_MODEL_UNAVAILABLE",
  );
  assert.equal(
    classifyProviderFailure(400, {
      error: { message: "output_config.format.schema is not supported" },
    }),
    "AI_REQUEST_FORMAT",
  );
  assert.equal(classifyProviderFailure(429, {}), "AI_RATE_LIMIT");
  assert.equal(classifyProviderFailure(503, {}), "AI_PROVIDER_ERROR");
});

const wireJS = ts.transpileModule(
  fs.readFileSync("src/lib/clinical/claude-schema.ts", "utf8"),
  {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}},
).outputText;
const {normalizeClaudeSummary} = await import(
  "data:text/javascript;base64," + Buffer.from(wireJS).toString("base64"),
);
test("Claude empty placeholders normalize without losing dates, values or source checks", () => {
  const bi={he:"בדיקה",en:"Test"};
  const fact={text:bi,date:"",refs:[{document_id:"doc",page:1,quote:"Original quotation"}]};
  const wire={
    overview:fact,
    sections:["referral","history","findings","medications","allergies","plan"].map(kind=>({
      kind,title:bi,items:[fact],missing:[],
    })),
    questions:[],conflicts:[],limitations:[],
    presentation:{eligible:true,reason:bi,slides:[{
      kind:"pumping",title:bi,explanation:bi,bullets:[fact],key_value:{he:"",en:""},
    }]},
  };
  const source={document_id:"doc",filename:"test.pdf",pages:1,sha256:"hash"};
  const normalized=normalizeClaudeSummary(wire);
  validateSummary(normalized,[source]);
  assert.equal(normalized.overview.date,null);
  assert.equal(normalized.presentation.slides[0].key_value,null);
  assert.equal(normalized.overview.refs[0].quote,"Original quotation");
  assert.equal(wire.overview.date,""); // Never mutate the provider payload.
  const measured=structuredClone(wire);
  measured.overview.date="2026-10-01";
  measured.presentation.slides[0].key_value={he:"38%",en:"38%"};
  const retained=normalizeClaudeSummary(measured);
  assert.equal(retained.overview.date,"2026-10-01");
  assert.deepEqual(retained.presentation.slides[0].key_value,{he:"38%",en:"38%"});
  const unsafe=structuredClone(wire);
  unsafe.overview.refs[0].document_id="another-patient";
  assert.throws(()=>validateSummary(normalizeClaudeSummary(unsafe),[source]),/INVALID_SOURCE_REFERENCE/);
});
