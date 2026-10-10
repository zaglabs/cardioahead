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
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { normalizeClaudeSummary } = await import(
  "data:text/javascript;base64," + Buffer.from(wireJS).toString("base64")
);
test("Claude empty placeholders normalize without losing dates, values or source checks", () => {
  const bi = { he: "בדיקה", en: "Test" };
  const fact = {
    text: bi,
    date: "",
    refs: [{ document_id: "doc", page: 1, quote: "Original quotation" }],
  };
  const wire = {
    overview: fact,
    sections: [
      "referral",
      "history",
      "findings",
      "medications",
      "allergies",
      "plan",
    ].map((kind) => ({
      kind,
      title: bi,
      items: [fact],
      missing: [],
    })),
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
          key_value: { he: "", en: "" },
        },
      ],
    },
  };
  const source = {
    document_id: "doc",
    filename: "test.pdf",
    pages: 1,
    sha256: "hash",
  };
  const normalized = normalizeClaudeSummary(wire);
  validateSummary(normalized, [source]);
  assert.equal(normalized.overview.date, null);
  assert.equal(normalized.presentation.slides[0].key_value, null);
  assert.equal(normalized.overview.refs[0].quote, "Original quotation");
  assert.equal(wire.overview.date, ""); // Never mutate the provider payload.
  const measured = structuredClone(wire);
  measured.overview.date = "2026-10-01";
  measured.presentation.slides[0].key_value = { he: "38%", en: "38%" };
  const retained = normalizeClaudeSummary(measured);
  assert.equal(retained.overview.date, "2026-10-01");
  assert.deepEqual(retained.presentation.slides[0].key_value, {
    he: "38%",
    en: "38%",
  });
  const unsafe = structuredClone(wire);
  unsafe.overview.refs[0].document_id = "another-patient";
  assert.throws(
    () => validateSummary(normalizeClaudeSummary(unsafe), [source]),
    /INVALID_SOURCE_REFERENCE/,
  );
});

const motionJS = ts.transpileModule(
  fs.readFileSync("src/lib/clinical/illustration-motion.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { cardiacCycle, arteryPosition, lumenRadius } = await import(
  "data:text/javascript;base64," + Buffer.from(motionJS).toString("base64")
);
test("illustration valves gate filling and ejection; flow stays forward and accelerates through narrowing", () => {
  const fill = cardiacCycle(0.2),
    contract = cardiacCycle(0.43),
    eject = cardiacCycle(0.56),
    relax = cardiacCycle(0.73);
  assert.equal(fill.mitralOpen, true);
  assert.equal(fill.aorticOpen, false);
  assert.equal(contract.contraction, 0);
  assert.equal(relax.contraction, 1);
  assert.equal(cardiacCycle(0.7).contraction, cardiacCycle(0.92).contraction);
  assert.equal(contract.mitralOpen, false);
  assert.equal(contract.aorticOpen, false);
  assert.equal(eject.mitralOpen, false);
  assert.equal(eject.aorticOpen, true);
  assert.equal(relax.mitralOpen, false);
  assert.equal(relax.aorticOpen, false);
  for (let p = 0; p < 1; p += 0.01)
    assert.ok(!(cardiacCycle(p).mitralOpen && cardiacCycle(p).aorticOpen));
  for (const expanded of [0, 1]) {
    let previous = 60;
    for (let p = 0; p < 1; p += 0.01) {
      const x = arteryPosition(p, expanded);
      assert.ok(x >= previous && x <= 560);
      previous = x;
    }
  }
  const central = arteryPosition(0.51, 0) - arteryPosition(0.49, 0);
  const proximal = arteryPosition(0.11, 0) - arteryPosition(0.09, 0);
  assert.ok(central > proximal); // No misleading slowdown in the stenotic throat.
  assert.ok(lumenRadius(310, 1) > lumenRadius(310, 0));
  assert.ok(lumenRadius(310, 1) < 42); // Plaque remains after the mesh expands.
});

const focusJS = ts.transpileModule(
  fs.readFileSync("src/lib/clinical/presentation-focus.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { resolveVisualFinding } = await import(
  "data:text/javascript;base64," + Buffer.from(focusJS).toString("base64")
);
test("patient visuals require cited support and never infer current stenosis from historical PCI", () => {
  const source = {
    document_id: "doc",
    filename: "test.pdf",
    pages: 1,
    sha256: "test",
  };
  const fact = (text, quote) => ({
    text: { he: text, en: text },
    date: null,
    refs: [{ document_id: "doc", page: 1, quote }],
  });
  const slide = (kind, bullets) => ({
    kind,
    title: { he: "Test", en: "Test" },
    explanation: { he: "Test", en: "Test" },
    bullets,
    key_value: null,
  });
  const weak = fact(
    "Reduced left ventricular systolic function",
    "הרחבה קלה של חדר שמאל וירידה בתפקוד הסיסטולי.",
  );
  assert.equal(
    resolveVisualFinding(slide("pumping", [weak]), [source]).mode,
    "comparison",
  );
  assert.equal(
    resolveVisualFinding(
      slide("pumping", [
        fact(
          "Suspected reduced LV function",
          "Reduced LV function cannot be confirmed",
        ),
      ]),
      [source],
    ),
    null,
  );
  assert.equal(
    resolveVisualFinding(
      slide("pumping", [
        {
          ...weak,
          refs: [
            { document_id: "other", page: 1, quote: "Reduced LV function" },
          ],
        },
      ]),
      [source],
    ),
    null,
  );
  const past = resolveVisualFinding(
    slide("stent", [fact("Prior LAD PCI (historical)", "LAD PCI in 2018")]),
    [source],
  );
  assert.equal(past.area, "lad");
  assert.equal(past.mode, "location");
  assert.equal(past.historical, true);
  assert.equal(
    resolveVisualFinding(
      slide("valve", [fact("Mitral stenosis", "Aortic stenosis")]),
      [source],
    ),
    null,
  );
  assert.equal(
    resolveVisualFinding(
      slide("valve", [fact("Mitral stenosis", "Mitral stenosis")]),
      [source],
    ).area,
    "mitral",
  );
});
