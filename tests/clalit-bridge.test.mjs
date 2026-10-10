import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import {
  startImportBridge,
  stopImportBridge,
} from "../scripts/clalit-import-bridge.mjs";
import {
  collectorState,
  rememberMedicalRecord,
  rememberCoverage,
  collectedBundle,
  collectedCounts,
  clearCollectedRecords,
} from "../scripts/clalit-import-state.mjs";
const origin = "http://127.0.0.1:3185",
  token = "a".repeat(48);
function call(
  path,
  {
    method = "POST",
    host = "127.0.0.1:3185",
    referer = origin,
    nonce = collectorState().nonce,
    body = { token },
  } = {},
) {
  return new Promise((resolve, reject) => {
    const req = request(
      origin + path,
      {
        method,
        headers: {
          host,
          origin: referer,
          "x-collector-nonce": nonce,
          "content-type": "application/json",
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end(method === "GET" ? undefined : JSON.stringify(body));
  });
}
test("loopback pairing rejects cross-site requests and transfers only reviewed sources to the fixed destination; raw buffer clears on acceptance", async () => {
  let remoteStatus = "awaiting_collection";
  const originalFetch = globalThis.fetch,
    sent = [];
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(
      url,
      "https://www.cardioahead.com/api/clinic/medical-imports/upload",
    );
    assert.equal(options.headers.Authorization, "Bearer " + token);
    assert.equal(options.redirect, "error");
    sent.push({ method: options.method || "GET", body: options.body });
    return new Response(
      JSON.stringify(
        options.method === "POST"
          ? { queued: true, original_documents_saved: false }
          : {
              provider: "clalit",
              subject_scope: "self",
              patient_label: "Fictional owner card",
              status: remoteStatus,
              claude_consent: true,
            },
      ),
      { status: options.method === "POST" ? 202 : 200 },
    );
  };
  try {
    await startImportBridge(3185);
    const first = rememberMedicalRecord(
      "laboratory",
      ["FICTIONAL_VALUE: 7.3 mg/dL"],
      { record_reference: "FAKE-1", collection_date_text: "01.01.2026" },
      "https://e-services.clalit.co.il/fictional?session=NEVER_EXPORT",
      true,
      "Fictional lab",
    );
    rememberMedicalRecord(
      "laboratory",
      ["FICTIONAL_OTHER: 9.2"],
      { record_reference: "FAKE-2", collection_date_text: "02.01.2026" },
      "https://e-services.clalit.co.il/fictional",
      true,
      "Fictional second lab",
    );
    rememberCoverage("laboratory", "partial", 2);
    const html = await call("/connect", { method: "GET" });
    assert.equal(html.status, 200);
    assert.match(
      html.headers["content-security-policy"],
      /frame-ancestors 'none'/,
    );
    assert.equal(html.headers["referrer-policy"], "no-referrer");
    assert.doesNotMatch(html.text, /FICTIONAL_VALUE|NEVER_EXPORT/);
    for (const settings of [
      { host: "attacker.test" },
      { referer: "https://attacker.test" },
      { nonce: "wrong" },
      { body: { token: "invalid" } },
    ]) {
      const result = await call("/status", settings);
      assert.ok([401, 403].includes(result.status));
    }
    assert.equal(sent.length, 0);
    const status = await call("/status");
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.text).manifest.length, 2);
    assert.doesNotMatch(status.text, /7\.3|9\.2|NEVER_EXPORT|FAKE-1/);
    collectorState().running = true;
    assert.equal(
      (await call("/transfer", { body: { token, source_ids: [first] } }))
        .status,
      409,
    );
    collectorState().running = false;
    assert.equal(
      (
        await call("/transfer", {
          body: { token, source_ids: ["not-a-source"] },
        })
      ).status,
      503,
    );
    assert.equal(sent.filter((item) => item.method === "POST").length, 0);
    const imported = await call("/transfer", {
      body: { token, source_ids: [first] },
    });
    assert.equal(imported.status, 200);
    const packet = JSON.parse(sent.find((item) => item.method === "POST").body);
    assert.equal(packet.records.length, 1);
    assert.equal(packet.records[0].id, first);
    assert.equal(packet.coverage[0].status, "partial");
    assert.doesNotMatch(JSON.stringify(packet), /FICTIONAL_OTHER|NEVER_EXPORT/);
    assert.equal(collectedCounts().record_count, 0);
    assert.throws(collectedBundle, /COLLECTION_EXPIRED/);
    rememberMedicalRecord(
      "laboratory",
      ["FICTIONAL_EXPIRED"],
      { record_reference: null, collection_date_text: null },
      "https://e-services.clalit.co.il/fictional",
      false,
    );
    remoteStatus = "ready";
    const completed = await call("/status");
    assert.equal(JSON.parse(completed.text).target.status, "ready");
    assert.equal(
      collectedCounts().record_count,
      1,
      "Old ready connections cannot clear a newly collected source",
    );
    assert.equal(collectorState().import_status.status, "ready");
    assert.equal(
      Object.hasOwn(collectorState().import_status, "patient_label"),
      false,
    );
    collectorState().expires_at = Date.now() - 1;
    assert.equal(collectedCounts().record_count, 0);
  } finally {
    clearCollectedRecords();
    await stopImportBridge();
    globalThis.fetch = originalFetch;
  }
});
