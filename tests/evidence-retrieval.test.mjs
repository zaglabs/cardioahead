import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(name) {
  const output = ts.transpileModule(
    fs.readFileSync("src/lib/evidence/" + name + ".ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const fixtureModule = { exports: {} };
  const require = (id) =>
    id === "server-only"
      ? {}
      : id.includes("/config")
        ? { localTestMode: () => false }
        : id === "./queries"
          ? load("queries")
          : (() => {
              throw Error(id);
            })();
  new Function("module", "exports", "require", output)(
    fixtureModule,
    fixtureModule.exports,
    require,
  );
  return fixtureModule.exports;
}
test("live-adapter parsing recognizes original guidelines, rejects incidental guideline mentions and detects mismatched full-text identities", async () => {
  const previous = globalThis.fetch;
  const abstract =
    "This synthetic heart failure source describes patient-specific assessment of symptoms, kidney function and potassium before evaluating treatment applicability.";
  const entries = [
    {
      id: "10001",
      source: "MED",
      title: "2026 ESC Guidelines for the management of heart failure.",
      firstPublicationDate: "2026-08-28",
      pubTypeList: { pubType: ["Journal Article"] },
    },
    {
      id: "10002",
      source: "MED",
      title: "2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure.",
      firstPublicationDate: "2022-04-01",
      abstractText: abstract,
      pubTypeList: { pubType: ["Journal Article"] },
    },
    {
      id: "10003",
      source: "MED",
      title:
        "Iron Deficiency in Heart Failure: From ESC Guidelines to Clinical Practice.",
      firstPublicationDate: "2025-01-01",
      abstractText: abstract,
      pubTypeList: { pubType: ["Journal Article"] },
    },
    {
      id: "10004",
      source: "MED",
      title: "A systematic review of heart failure treatment.",
      firstPublicationDate: "2025-01-01",
      abstractText: abstract,
      pubTypeList: { pubType: ["Systematic Review"] },
      pmcid: "PMC10004",
      isOpenAccess: "Y",
    },
    {
      id: "10005",
      source: "MED",
      title: "Retracted heart failure treatment trial.",
      firstPublicationDate: "2025-01-01",
      abstractText: abstract,
      pubTypeList: { pubType: ["Retracted Publication"] },
    },
  ];
  globalThis.fetch = async (url) =>
    String(url).includes("fullTextXML")
      ? new Response(
          '<article><front><article-id pub-id-type="pmid">99999</article-id></front><body><p>' +
            abstract +
            "</p></body></article>",
        )
      : Response.json({
          hitCount: entries.length,
          resultList: { result: entries },
        });
  try {
    const result = await load("retrieval").retrieveLiterature([
      "heart_failure",
    ]);
    assert.equal(result.searches.length, 5);
    assert.equal(
      result.searches.some((s) => s.failure),
      false,
    );
    assert.equal(
      result.sources.find((s) => s.id === "PMID:10001").evidence_type,
      "guideline",
    );
    assert.equal(
      result.sources.find((s) => s.id === "PMID:10002").organisation,
      "ACC/AHA",
    );
    assert.notEqual(
      result.sources.find((s) => s.id === "PMID:10003")?.evidence_type,
      "guideline",
    );
    assert.equal(
      result.sources.find((s) => s.id === "PMID:10004").access,
      "abstract_only",
    );
    assert.equal(
      result.sources.some((s) => s.id === "PMID:10005"),
      false,
    );
    assert.ok(result.limitations.includes("FULL_TEXT_UNAVAILABLE:PMID:10004"));
    assert.ok(
      result.limitations.includes(
        "LATEST_GUIDELINE_TEXT_UNAVAILABLE:PMID:10001",
      ),
    );
  } finally {
    globalThis.fetch = previous;
  }
});
