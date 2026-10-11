import { test } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createRemoteClalitPilot, privateSessionSettings } from "../scripts/clalit-remote-runtime.mjs";
import { createRemotePilotServer } from "../scripts/clalit-remote-server.mjs";
import { rememberMedicalRecord, collectedCounts } from "../scripts/clalit-import-state.mjs";
const sessionId = "11111111-1111-4111-8111-111111111111";
const input = { api_key: "bb_FICTIONAL_NOT_A_REAL_KEY", hosted_consent: true };
function fixture(overrides = {}) {
  const calls = [];
  let browserClosed = 0, collectCalls = 0;
  const browser = { contexts: () => [{ pages: () => [{ goto: async () => {} }] }], close: async () => { browserClosed++; } };
  const api = async (url, settings = {}) => {
    calls.push({ url, settings });
    if (url.endsWith("/debug")) return Response.json({ debuggerFullscreenUrl: "https://www.browserbase.com/devtools/FICTIONAL_VIEW", wsUrl: "SECRET_WEBSOCKET", pages: [] });
    if (url.endsWith(sessionId)) return Response.json({ status: "COMPLETED" });
    return Response.json({ id: sessionId, expiresAt: new Date(Date.now() + 900000).toISOString(), connectUrl: "wss://connect.browserbase.com/FICTIONAL" });
  };
  const pilot = createRemoteClalitPilot({ request: api, connect: async () => browser,
    inspect: async () => ({ medical_record_root_found: true, known_menu_counts: [{ category: "session_exit_control", visible_matches: 1 }] }),
    collect: async () => {
      collectCalls++;
      rememberMedicalRecord("laboratory", ["FICTIONAL_SECRET_HEALTH_VALUE"], { record_reference: "FICTIONAL_REFERENCE", collection_date_text: "01.01.2026" }, "https://e-services.clalit.co.il/result?private=secret", true);
    }, ...overrides });
  return { pilot, calls, browserClosed: () => browserClosed, collectCalls: () => collectCalls };
}
test("hosted session requires explicit consent and never starts on a button click without it", async () => {
  const f = fixture();
  await assert.rejects(f.pilot.start({ ...input, hosted_consent: false }), /CONSENT_REQUIRED/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.pilot.status().connected, false);
});
test("session disables recording/logging and retains no saved browser profile; public status omits service credentials", async () => {
  const f = fixture();
  try {
    const result = await f.pilot.start(input);
    const body = JSON.parse(f.calls[0].settings.body);
    assert.deepEqual(body, privateSessionSettings);
    assert.equal(body.browserSettings.recordSession, false);
    assert.equal(body.browserSettings.logSession, false);
    assert.equal(body.browserSettings.solveCaptchas, false);
    assert.equal(body.browserSettings.ignoreCertificateErrors, false);
    assert.equal(body.keepAlive, false);
    assert.equal(body.region, "eu-central-1");
    assert.equal(body.contextId, undefined);
    assert.equal(f.collectCalls(), 0);
    assert.equal(result.connected, false);
    assert.equal(result.ai_enabled, false);
    assert.equal(result.uploads_enabled, false);
    const output = JSON.stringify(result);
    assert.equal(output.includes(input.api_key), false);
    assert.equal(output.includes("SECRET_WEBSOCKET"), false);
    assert.equal(output.includes(sessionId), false);
    await assert.rejects(f.pilot.check({ own_account: true, read_consent: false }), /CONSENT_REQUIRED/);
    assert.equal(f.collectCalls(), 0);
  } finally { await f.pilot.close(); }
  assert.ok(f.browserClosed() > 0);
  assert.equal(JSON.parse(f.calls.at(-1).settings.body).status, "REQUEST_RELEASE");
});
test("login and navigation do not falsely establish medical access; unauthenticated record check performs no collection", async () => {
  const f = fixture({ inspect: async () => ({ medical_record_root_found: false, known_menu_counts: [] }) });
  try {
    await f.pilot.start(input);
    const status = await f.pilot.check({ own_account: true, read_consent: true });
    assert.equal(status.error, "SIGNIN_REQUIRED");
    assert.equal(status.connected, false);
    assert.equal(status.record_count, 0);
    assert.equal(f.collectCalls(), 0);
  } finally { await f.pilot.close(); }
});
test("successful read returns only counts and clears temporary source text without any upload or AI call", async () => {
  const f = fixture();
  try {
    await f.pilot.start(input);
    const status = await f.pilot.check({ own_account: true, read_consent: true });
    assert.equal(status.stage, "checked");
    assert.equal(status.record_count, 1);
    assert.equal(status.entry_count, 1);
    assert.equal(status.raw_content_cleared, true);
    assert.equal(collectedCounts().record_count, 0);
    assert.equal(JSON.stringify(status).includes("FICTIONAL_SECRET"), false);
    assert.equal(JSON.stringify(status).includes("FICTIONAL_REFERENCE"), false);
    assert.ok(f.calls.every((call) => call.url.startsWith("https://api.browserbase.com/v1/sessions")));
  } finally { await f.pilot.close(); }
});
test("provider errors are sanitized; connection failure releases the allocated remote browser", async () => {
  const f = fixture({ connect: async () => { throw Error("wss://secret-provider?apiKey=DO_NOT_LEAK"); } });
  await assert.rejects(f.pilot.start(input), { message: "SERVICE_UNAVAILABLE" });
  assert.equal(f.pilot.status().stage, "closed");
  assert.equal(JSON.stringify(f.pilot.status()).includes("DO_NOT_LEAK"), false);
  assert.equal(JSON.parse(f.calls.at(-1).settings.body).status, "REQUEST_RELEASE");
});
test("closing during session creation releases the late allocated session", async () => {
  let finish, releases = 0;
  const pilot = createRemoteClalitPilot({ request: async (url) => {
    if (url.endsWith(sessionId)) { releases++; return Response.json({ status: "COMPLETED" }); }
    return new Promise((resolve) => { finish = () => resolve(Response.json({ id: sessionId, connectUrl: "wss://connect.browserbase.com/FICTIONAL" })); });
  }, connect: async () => { throw Error("must not connect after cancellation"); } });
  const start = pilot.start(input);
  await pilot.close();
  finish();
  await assert.rejects(start, /SESSION_EXPIRED/);
  assert.equal(releases, 1);
  assert.equal(pilot.status().stage, "closed");
});
test("loopback server requires private capability, exact host/origin, cookie and CSRF; no remote calls before authorization", async () => {
  const f = fixture(), app = await createRemotePilotServer({ port: 0, pilot: f.pilot });
  try {
    assert.equal((await fetch(app.origin + "/status")).status, 401);
    const foreignHostStatus = await new Promise((resolve, reject) => { const req = httpRequest(app.origin + "/", { headers: { Host: "foreign.invalid" } }, (res) => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); req.end(); });
    assert.equal(foreignHostStatus, 403);
    const capability = new URL(app.url).hash.slice("#access=".length);
    assert.equal((await fetch(app.origin + "/authorize", { method: "POST", headers: { Origin: "https://foreign.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ capability }) })).status, 403);
    const auth = await fetch(app.origin + "/authorize", { method: "POST", headers: { Origin: app.origin, "Content-Type": "application/json" }, body: JSON.stringify({ capability }) });
    const cookie = auth.headers.get("set-cookie").split(";")[0], { csrf } = await auth.json();
    assert.equal((await fetch(app.origin + "/start", { method: "POST", headers: { Origin: app.origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(input) })).status, 403);
    assert.equal(f.calls.length, 0);
    assert.equal((await fetch(app.origin + "/start", { method: "POST", headers: { Origin: app.origin, Cookie: cookie, "Content-Type": "application/json", "X-Pilot-CSRF": csrf }, body: JSON.stringify(input) })).status, 200);
    const status = await fetch(app.origin + "/status", { headers: { Cookie: cookie } });
    assert.equal(status.headers.get("cache-control"), "no-store");
    assert.equal((await status.text()).includes(input.api_key), false);
  } finally { await app.close(); }
});
test("desktop and narrow-screen UI uses masked operator key, genuine stages, heart loader and clears the remote view on close", async () => {
  const f = fixture(), app = await createRemotePilotServer({ port: 0, pilot: f.pilot });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://**.browserbase.com/**", (route) => route.fulfill({ body: "Fictional remote view", contentType: "text/html" }));
    await page.goto(app.url);
    await page.locator("#controls").waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(await page.locator("#key").getAttribute("type"), "password");
    await page.locator("#key").fill(input.api_key);
    await page.locator("#hosted").check();
    await page.getByRole("button", { name: "Open Clalit browser" }).click();
    await page.locator("#browser").waitFor({ state: "visible" });
    assert.equal(await page.locator("#key").inputValue(), "");
    assert.equal(f.collectCalls(), 0);
    await page.locator("#own").check(); await page.locator("#read").check();
    await page.getByRole("button", { name: "Check my record access" }).click();
    await page.locator("#results").waitFor({ state: "visible" });
    assert.match(await page.locator("#counts").textContent(), /1 supported records/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.getByRole("button", { name: "Close session & clear" }).click();
    await page.locator("#browser").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#viewer").getAttribute("src"), null);
    assert.equal(f.pilot.status().record_count, 0);
  } finally { await browser.close(); await app.close(); }
});
test("embedded browser works without cookies and reports validation errors next to the button without clearing the masked key", async () => {
  const f = fixture(), app = await createRemotePilotServer({ port: 0, pilot: f.pilot });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route(app.origin + "/**", async (route) => {
      const headers = { ...route.request().headers() };
      delete headers.cookie;
      await route.continue({ headers });
    });
    await page.route("https://**.browserbase.com/**", (route) => route.fulfill({ body: "Fictional remote view", contentType: "text/html" }));
    await page.goto(app.url);
    await page.locator("#controls").waitFor({ state: "visible" });
    await page.locator("#key").fill(input.api_key);
    await page.getByRole("button", { name: "Open Clalit browser", exact: true }).click();
    await page.locator("#error").waitFor({ state: "visible" });
    assert.match(await page.locator("#error").textContent(), /consent/);
    assert.equal(await page.locator("#key").inputValue(), input.api_key);
    assert.equal(f.calls.length, 0);
    await page.locator("#hosted").check();
    await page.locator("#project").fill("invalid-project");
    await page.getByRole("button", { name: "Open Clalit browser", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("error").textContent.includes("project ID"));
    assert.equal(await page.locator("#key").inputValue(), input.api_key);
    assert.equal(f.calls.length, 0);
    assert.equal(await page.locator("#start").isEnabled(), true);
    await page.locator("#project").fill("");
    await page.getByRole("button", { name: "Open Clalit browser", exact: true }).click();
    await page.locator("#browser").waitFor({ state: "visible" });
    assert.equal(await page.locator("#key").inputValue(), "");
    assert.equal(f.collectCalls(), 0);
    await page.getByRole("button", { name: "Close session & clear" }).click();
    await page.locator("#browser").waitFor({ state: "hidden" });
  } finally { await browser.close(); await app.close(); }
});
test("provider keys containing punctuation are forwarded privately instead of being reported as missing", async () => {
  const f = fixture();
  const punctuated = "bb_live_FICTIONAL.ABC+/=:_-~";
  try {
    const result = await f.pilot.start({ ...input, api_key: "  " + punctuated + "  " });
    assert.equal(f.calls[0].settings.headers["X-BB-API-Key"], punctuated);
    assert.equal(result.stage, "signin");
    assert.equal(JSON.stringify(result).includes(punctuated), false);
  } finally { await f.pilot.close(); }
});
test("empty values and unsafe header formatting produce distinct errors without calling the provider", async () => {
  const f = fixture();
  await assert.rejects(f.pilot.start({ ...input, api_key: "  " }), /KEY_REQUIRED/);
  await assert.rejects(f.pilot.start({ ...input, api_key: "FICTIONAL\r\nHEADER" }), /KEY_INVALID_FORMAT/);
  assert.equal(f.calls.length, 0);
});
test("key check verifies access without allocating a browser and reveals project IDs only", async () => {
  const calls = [];
  const f = fixture({ request: async (url, settings) => {
    calls.push({ url, settings });
    return Response.json([{ id: sessionId, name: "PRIVATE_PROJECT_NAME", ownerId: "PRIVATE_OWNER", defaultTimeout: 900 }]);
  }, connect: async () => { throw Error("key checks must not allocate browsers"); } });
  const result = await f.pilot.checkKey(input);
  assert.equal(result.key_accepted, true);
  assert.deepEqual(result.project_ids, [sessionId]);
  assert.equal(result.provider_diagnostic.http_status, 200);
  assert.equal(result.provider_diagnostic.operation, "key_check");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.browserbase.com/v1/projects");
  assert.equal(calls[0].settings.method, "GET");
  assert.equal(JSON.stringify(result).includes("PRIVATE_PROJECT_NAME"), false);
  assert.equal(JSON.stringify(result).includes(input.api_key), false);
  assert.equal(result.connected, false);
});
test("authentication and forbidden/settings failures are distinct and raw provider errors never escape", async () => {
  const invalid = fixture({ request: async () => Response.json({ message: "DO_NOT_LEAK_PRIVATE_KEY_OR_URL" }, { status: 401 }) });
  await assert.rejects(invalid.pilot.checkKey(input), /SERVICE_AUTH/);
  assert.equal(invalid.pilot.status().provider_diagnostic.http_status, 401);
  assert.equal(JSON.stringify(invalid.pilot.status()).includes("DO_NOT_LEAK"), false);
  const forbidden = fixture({ request: async () => Response.json({ message: "permission denied DO_NOT_LEAK" }, { status: 403 }) });
  await assert.rejects(forbidden.pilot.start(input), /SERVICE_FORBIDDEN/);
  assert.equal(forbidden.pilot.status().provider_diagnostic.http_status, 403);
  const privacy = fixture({ request: async () => Response.json({ message: "recordSession false is restricted DO_NOT_LEAK" }, { status: 403 }) });
  await assert.rejects(privacy.pilot.start(input), /SERVICE_PRIVACY_SETTINGS/);
  assert.equal(privateSessionSettings.browserSettings.recordSession, false);
  assert.equal(privateSessionSettings.browserSettings.logSession, false);
  assert.equal(JSON.stringify(privacy.pilot.status()).includes("DO_NOT_LEAK"), false);
});
test("key-check button populates a single accessible project and does not open a remote view", async () => {
  const f = fixture({ request: async () => Response.json([{ id: sessionId, name: "DO_NOT_DISPLAY" }]) });
  const app = await createRemotePilotServer({ port: 0, pilot: f.pilot });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(app.url);
    await page.locator("#controls").waitFor({ state: "visible" });
    await page.locator("#key").fill(input.api_key);
    await page.getByRole("button", { name: "Check Browserbase key", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("key-status").textContent.includes("accepted"));
    assert.equal(await page.locator("#project").inputValue(), sessionId);
    assert.equal(await page.locator("#key").inputValue(), input.api_key);
    assert.equal(await page.locator("#browser").isVisible(), false);
    assert.equal((await page.locator("body").textContent()).includes("DO_NOT_DISPLAY"), false);
  } finally { await browser.close(); await app.close(); }
});
test("Clalit security block closes the hosted session before login/collection and does not attempt a workaround", async () => {
  let connectionCount = 0;
  const f = fixture({ connect: async () => {
    connectionCount++;
    return { contexts: () => [{ pages: () => [{ goto: async () => ({ status: () => 403 }) }] }], close: async () => {} };
  } });
  await assert.rejects(f.pilot.start(input), /CLALIT_ACCESS_BLOCKED/);
  assert.equal(f.pilot.status().stage, "closed");
  assert.equal(f.pilot.status().error, "CLALIT_ACCESS_BLOCKED");
  assert.equal(f.pilot.status().connected, false);
  assert.equal(f.pilot.status().record_count, 0);
  assert.equal(f.collectCalls(), 0);
  assert.equal(connectionCount, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(JSON.parse(f.calls.at(-1).settings.body).status, "REQUEST_RELEASE");
});