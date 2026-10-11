import { chromium } from "playwright-core";
import { inspectMedicalMenus, collectMedicalCategories, isTrustedClalit } from "./clalit-navigation.mjs";
import { inspectLabStructure } from "./clalit-structure.mjs";
import { clearCollectedRecords, collectedCounts, collectorState } from "./clalit-import-state.mjs";

const providerOrigin = "https://api.browserbase.com";
const login = "https://e-services.clalit.co.il/OnlineWeb/General/InfoFullLogin.aspx";
export const privateSessionSettings = Object.freeze({
  timeout: 900,
  keepAlive: false,
  region: "eu-central-1",
  browserSettings: {
    recordSession: false,
    logSession: false,
    solveCaptchas: false,
    advancedStealth: false,
    ignoreCertificateErrors: false,
    viewport: { width: 1280, height: 900 },
  },
});
const errors = new Set(["CLALIT_ACCESS_BLOCKED", "KEY_REQUIRED", "KEY_INVALID_FORMAT", "INVALID_PROJECT", "CONSENT_REQUIRED", "SESSION_ACTIVE", "SIGNIN_REQUIRED", "SESSION_EXPIRED", "SERVICE_AUTH", "SERVICE_FORBIDDEN", "SERVICE_CONFIG", "SERVICE_PRIVACY_SETTINGS", "SERVICE_REGION", "SERVICE_PROJECT", "SERVICE_LIMIT", "SERVICE_UNAVAILABLE", "SESSION_START_FAILED", "REMOTE_BROWSER_UNAVAILABLE", "RECORD_CHECK_FAILED", "SESSION_RELEASE_FAILED"]);
export const safePilotError = (error) => errors.has(error?.message) ? error.message : "SERVICE_UNAVAILABLE";
function trustedProviderUrl(raw, websocket = false) {
  try {
    const url = new URL(raw);
    return url.protocol === (websocket ? "wss:" : "https:") && !url.username && !url.password &&
      (url.hostname === "browserbase.com" || url.hostname.endsWith(".browserbase.com"));
  } catch { return false; }
}
// A single owner-only feasibility session. No upload, AI calls, persisted browser contexts or record files.
export function createRemoteClalitPilot({ request = fetch, connect = (url) => chromium.connectOverCDP(url, { timeout: 30000 }), inspect = inspectMedicalMenus, collect = collectMedicalCategories, now = Date.now } = {}) {
  let key = null, id = null, project = null, browser = null, context = null, expiry = 0, timer = null;
  let closing = null, starting = false, checking = false, generation = 0;
  let providerDiagnostic = null;
  function validatedKey(value) { if (typeof value !== "string" || !value.trim()) throw Error("KEY_REQUIRED"); const normalized = value.trim(); if (normalized.length > 1024 || !/^[\x21-\x7e]+$/.test(normalized)) throw Error("KEY_INVALID_FORMAT"); return normalized; }
  let state = { stage: "setup", error: null, login_page_loaded: false, record_count: 0, entry_count: 0, categories: [], coverage: [], raw_content_cleared: true, connected: false };
  async function api(path, method = "GET", body) {
    let response;
    try {
      response = await request(providerOrigin + path, {
        method, redirect: "error", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
      });
    } catch { throw Error("SERVICE_UNAVAILABLE"); }
    const operation = path === "/v1/projects" ? "key_check" : path === "/v1/sessions" ? "create_session" : path.endsWith("/debug") ? "open_view" : "release_session";
    providerDiagnostic = { operation, http_status: response.status, reason: null };
    if (!response.ok) {
      let code = response.status === 401 ? "SERVICE_AUTH" : response.status === 403 ? "SERVICE_FORBIDDEN" : response.status === 400 || response.status === 422 ? "SERVICE_CONFIG" : response.status === 429 || response.status === 402 ? "SERVICE_LIMIT" : "SERVICE_UNAVAILABLE";
      // Inspect only to select fixed classifications; never retain or expose provider error bodies.
      try {
        const detail = await response.json();
        const message = [detail.message, typeof detail.error === "string" ? detail.error : detail.error?.message].filter((part) => typeof part === "string").join(" ").slice(0, 8192);
        if (response.status !== 401 && /recordSession|logSession|session recording|session logging/i.test(message)) code = "SERVICE_PRIVACY_SETTINGS";
        else if (response.status !== 401 && /region/i.test(message) && /unsupported|not available|not allowed|invalid|restricted/i.test(message)) code = "SERVICE_REGION";
        else if (response.status !== 401 && /project/i.test(message) && /required|not found|invalid|access|permission/i.test(message)) code = "SERVICE_PROJECT";
      } catch { /* Fixed HTTP classification is sufficient. */ }
      providerDiagnostic.reason = code;
      throw Error(code);
    }
    try { return await response.json(); } catch { throw Error("SERVICE_UNAVAILABLE"); }
  }
  function active() {
    if (!id || !context || expiry <= now() || closing) throw Error("SESSION_EXPIRED");
  }
  async function close() {
    if (closing) return closing;
    generation++;
    clearTimeout(timer); timer = null;
    closing = (async () => {
      // Stop readers before clearing their in-memory buffer.
      await browser?.close().catch(() => {});
      browser = null; context = null;
      clearCollectedRecords();
      let released = !id;
      if (id && key) {
        for (let attempt = 0; attempt < 2 && !released; attempt++) {
          try { await api("/v1/sessions/" + id, "POST", { status: "REQUEST_RELEASE", ...(project ? { projectId: project } : {}) }); released = true; } catch { /* Fixed provider timeout remains in force. */ }
        }
      }
      if (released) { key = null; id = null; project = null; }
      expiry = 0;
      state = { stage: released ? "closed" : "close_unconfirmed", error: released ? null : "SESSION_RELEASE_FAILED", login_page_loaded: false, connected: false, raw_content_cleared: true, record_count: 0, entry_count: 0, categories: [], coverage: [] };
      return released;
    })();
    try { return await closing; } finally { closing = null; }
  }
  async function start({ api_key, project_id, hosted_consent } = {}) {
    if (starting || id) throw Error("SESSION_ACTIVE");
    if (hosted_consent !== true) throw Error("CONSENT_REQUIRED");
    if (typeof api_key !== "string" || !api_key.trim()) throw Error("KEY_REQUIRED");
    // Do not guess the provider key format. Permit printable HTTP-header characters, including punctuation.
    if (api_key.trim().length > 1024 || !/^[\x21-\x7e]+$/.test(api_key.trim())) throw Error("KEY_INVALID_FORMAT");
    if (project_id && !/^[0-9a-f-]{36}$/i.test(project_id)) throw Error("INVALID_PROJECT");
    starting = true;
    const current = ++generation;
    const startKey = validatedKey(api_key); key = startKey; project = project_id || null;
    state = { ...state, stage: "starting", error: null };
    try {
      const session = await api("/v1/sessions", "POST", { ...privateSessionSettings, ...(project ? { projectId: project } : {}) });
      if (!/^[0-9a-f-]{36}$/i.test(session.id || "")) throw Error("SESSION_START_FAILED");
      id = session.id; key = startKey; if (generation !== current) throw Error("SESSION_EXPIRED");
      expiry = Math.min(now() + 900000, Date.parse(session.expiresAt) || Infinity);
      timer = setTimeout(() => void close(), Math.max(1, expiry - now()));
      timer.unref();
      if (!trustedProviderUrl(session.connectUrl, true)) throw Error("SESSION_START_FAILED");
      browser = await connect(session.connectUrl);
      if (generation !== current) throw Error("SESSION_EXPIRED");
      browser.on?.("disconnected", () => { if (generation === current && !closing) void close(); });
      context = browser.contexts()[0];
      if (!context) throw Error("REMOTE_BROWSER_UNAVAILABLE");
      const page = context.pages()[0] || await context.newPage();
      // Only navigate to the official login. Never inspect, fill or log login fields.
      let accessBlocked = false;
      try {
        const response = await page.goto(login, { waitUntil: "domcontentloaded", timeout: 45000 });
        accessBlocked = [403, 451].includes(response?.status?.());
        if (page.getByText) accessBlocked ||= await page.getByText(/^(Access denied|Error (15|16))$/i).first().isVisible().catch(() => false);
        state.login_page_loaded = !accessBlocked;
      }
      catch { state.login_page_loaded = false; }
      if (accessBlocked) throw Error("CLALIT_ACCESS_BLOCKED");
      active();
      state.stage = "signin";
      return await liveView();
    } catch (error) {
      const code = safePilotError(error);
      await close();
      state.error = code;
      throw Error(code);
    } finally { starting = false; }
  }
  async function liveView() {
    active();
    const views = await api("/v1/sessions/" + id + "/debug");
    const matching = (views.pages || []).filter((page) => isTrustedClalit(page.url));
    const url = matching.at(-1)?.debuggerFullscreenUrl || views.debuggerFullscreenUrl;
    if (!trustedProviderUrl(url)) throw Error("REMOTE_BROWSER_UNAVAILABLE");
    // Only the temporary interactive view is returned; CDP, API key, titles and source URLs remain private.
    return { live_view_url: url, ...status() };
  }
  function status() {
    return { ...state, provider_diagnostic: providerDiagnostic, expires_at: expiry ? new Date(expiry).toISOString() : null, uploads_enabled: false, ai_enabled: false, provider: "Browserbase", mobile_verified: false };
  }
  async function check({ own_account, read_consent } = {}) {
    active();
    if (own_account !== true || read_consent !== true) throw Error("CONSENT_REQUIRED");
    if (checking) throw Error("SESSION_ACTIVE");
    checking = true;
    const current = generation;
    state = { ...state, stage: "checking", raw_content_cleared: false, error: null, connected: false, record_count: 0, entry_count: 0, categories: [], coverage: [] };
    clearCollectedRecords();
    try {
      // Evaluate only after the human explicitly finishes login and selects their own profile.
      const inventory = await inspect(context, inspectLabStructure);
      if (!inventory.medical_record_root_found || !inventory.known_menu_counts.some((item) => item.category === "session_exit_control" && item.visible_matches > 0)) throw Error("SIGNIN_REQUIRED");
      if (generation !== current) throw Error("SESSION_EXPIRED");
      state.connected = true;
      await collect(context, inspectLabStructure);
      if (generation !== current) throw Error("SESSION_EXPIRED");
      const counts = collectedCounts();
      state = { ...state, stage: counts.record_count ? "checked" : "no_supported_records", record_count: counts.record_count, entry_count: counts.entry_count, categories: counts.categories, coverage: [...collectorState().coverage.values()].map(({ category, status, record_count }) => ({ category, status, record_count })) };
    } catch (error) {
      if (generation === current) state = { ...state, stage: "signin", error: safePilotError(error) === "SERVICE_UNAVAILABLE" ? "RECORD_CHECK_FAILED" : safePilotError(error) };
    } finally {
      clearCollectedRecords(); checking = false;
      state.raw_content_cleared = true;
    }
    return status();
  }
  async function checkKey({ api_key } = {}) {
    if (starting || id) throw Error("SESSION_ACTIVE");
    const supplied = validatedKey(api_key);
    starting = true;
    key = supplied;
    providerDiagnostic = null;
    try {
      const projects = await api("/v1/projects");
      if (!Array.isArray(projects)) throw Error("SERVICE_CONFIG");
      const projectIds = projects.map((item) => item.id).filter((value) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
      return { key_accepted: true, project_ids: projectIds, ...status() };
    } finally { key = null; starting = false; }
  }
  return { start, liveView, status, check, close, checkKey };
}