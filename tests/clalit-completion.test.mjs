import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startCompletionCheck, stopCompletionCheck } from "../scripts/clalit-completion.mjs";
import { collectorState, clearCollectedRecords, rememberMedicalRecord } from "../scripts/clalit-import-state.mjs";
import { createClalitCollector } from "../scripts/clalit-collector-runtime.mjs";
const token = "z".repeat(48), scope = createHash("sha256").update(token).digest("hex");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("automatic close waits for a confirmed ready summary and works without a patient page polling", async () => {
  const original = globalThis.fetch;
  let remote = "generating", closes = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://www.cardioahead.com/api/clinic/medical-imports/upload");
    assert.equal(options.headers.Authorization, "Bearer " + token);
    return Response.json({ provider: "clalit", subject_scope: "self", status: remote });
  };
  const state = collectorState();
  clearCollectedRecords(); state.active_binding = scope;
  try {
    startCompletionCheck(token, { close: async () => { closes++; } }, { pollIntervalMs: 20, completionGraceMs: 20 });
    await pause(80); assert.equal(closes, 0);
    remote = "ready";
    await pause(100); assert.equal(closes, 1); assert.equal(state.cleanup_pending, true);
  } finally { stopCompletionCheck(); state.active_binding = null; globalThis.fetch = original; }
});
test("a different invitation or a later collection cannot be closed by an old ready receipt", async () => {
  const original = globalThis.fetch;
  let closes = 0;
  globalThis.fetch = async () => Response.json({ provider: "clalit", subject_scope: "self", status: "ready" });
  const state = collectorState();
  clearCollectedRecords(); state.active_binding = scope;
  try {
    startCompletionCheck(token, { close: async () => { closes++; } }, { pollIntervalMs: 20, completionGraceMs: 60 });
    await pause(30);
    state.active_binding = "another-invitation";
    await pause(100); assert.equal(closes, 0);
    stopCompletionCheck(); state.active_binding = scope;
    rememberMedicalRecord("laboratory", ["FICTIONAL_PENDING: 5"], { record_reference: "FIXTURE", collection_date_text: "01.01.2026" }, "https://e-services.clalit.co.il/fixture", true);
    startCompletionCheck(token, { close: async () => { closes++; } }, { pollIntervalMs: 20, completionGraceMs: 20 });
    await pause(100); assert.equal(closes, 0);
  } finally { stopCompletionCheck(); clearCollectedRecords(); state.active_binding = null; globalThis.fetch = original; }
});
test("failure and malformed completion responses do not trigger successful-import cleanup", async () => {
  const original = globalThis.fetch;
  let closes = 0;
  const state = collectorState(); clearCollectedRecords(); state.active_binding = scope;
  try {
    for (const packet of [{ provider: "clalit", subject_scope: "self", status: "failed" }, { provider: "another-provider", subject_scope: "self", status: "ready" }]) {
      globalThis.fetch = async () => Response.json(packet);
      startCompletionCheck(token, { close: async () => { closes++; } }, { pollIntervalMs: 20, completionGraceMs: 20 });
      await pause(70); assert.equal(closes, 0); stopCompletionCheck();
    }
  } finally { stopCompletionCheck(); state.active_binding = null; globalThis.fetch = original; }
});
test("session expiry closes the collector and erases the temporary source buffer", async () => {
  const app = await createClalitCollector({ port: 3189, sessionMs: 80 });
  rememberMedicalRecord("laboratory", ["FICTIONAL_EXPIRES: 5"], { record_reference: "EXPIRY_FIXTURE" }, "https://e-services.clalit.co.il/fixture", true);
  await pause(180);
  assert.equal(collectorState().server, null);
  assert.equal(collectorState().records.size, 0);
  await app.close();
});
test("closing during browser startup waits for launch and shuts down without a false startup failure", async () => {
  let finishLaunch, browserClosed = false;
  const app = await createClalitCollector({ port: 3190, browserType: { launch: () => new Promise((resolve) => { finishLaunch = resolve; }) } });
  const opening = app.openHome();
  const closing = app.close();
  assert.equal(app.isClosing(), true);
  finishLaunch({ close: async () => { browserClosed = true; } });
  await assert.rejects(opening, /COLLECTOR_CLOSED/);
  await closing;
  assert.equal(browserClosed, true);
  assert.equal(collectorState().server, null);
});