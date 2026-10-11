// Trusted static UI. Dynamic values use textContent; no key, health data or capability is persisted.
function setupPage() {
  const $ = (id) => document.getElementById(id);
  let csrf = null, accessToken = null, polling = null, busy = false, currentState = { stage: "setup" };
  const errors = {
    CLALIT_ACCESS_BLOCKED: "Clalit blocked this remote browser with an access-denied page. The test session has been closed. No records were collected. A provider-approved connection is needed before retrying this approach.", KEY_REQUIRED: "Enter the Browserbase API key in the masked field.", KEY_INVALID_FORMAT: "The pasted value contains extra formatting or is too long. Copy only the API key, without spaces, line breaks or surrounding quotation marks.", INVALID_PROJECT: "Check the Browserbase project ID, or leave it blank.", CONSENT_REQUIRED: "Please check the required consent boxes.", SESSION_ACTIVE: "A session or check is already running. Close it before starting another.", SIGNIN_REQUIRED: "We could not verify a Clalit medical-record menu. Finish signing in and select your own profile, then try again.", SESSION_EXPIRED: "The browser session ended or expired. Start a fresh session.", SERVICE_AUTH: "Browserbase returned HTTP 401: this key was not accepted. Copy a Browserbase API key from your project Settings / API Keys page, rather than a model-provider key or Agents token.", SERVICE_FORBIDDEN: "Browserbase returned HTTP 403: this request is not permitted for this key or account. Use Check Browserbase key to verify access, then check the selected project and account permissions.", SERVICE_CONFIG: "Browserbase rejected the session settings. Use Check Browserbase key to verify the key separately.", SERVICE_PRIVACY_SETTINGS: "Browserbase rejected the recording/logging settings. The test will not enable recording or browser logging to work around this restriction.", SERVICE_REGION: "Browserbase rejected the requested Frankfurt browser region. Check which regions your account supports.", SERVICE_PROJECT: "Browserbase rejected the project selection. Use Check Browserbase key and select an accessible project.", SERVICE_LIMIT: "Browserbase reported a quota or plan limit. Check your account before trying again.", SERVICE_UNAVAILABLE: "The browser service could not be reached. No provider error details or credentials are shown here.", SESSION_START_FAILED: "The remote session could not be started.", REMOTE_BROWSER_UNAVAILABLE: "The interactive browser view is unavailable.", RECORD_CHECK_FAILED: "The record check did not complete. Nothing was uploaded or sent to AI.", SESSION_RELEASE_FAILED: "Closing the remote session could not be confirmed. Close it in Browserbase; the 15-minute provider timeout is also in force.", LOCAL_AUTH_REQUIRED: "Open the private test link provided by Codex to authorize this page.", CSRF_DENIED: "This page could not authorize the request. Reopen the private test link.", ORIGIN_DENIED: "This request came from another page and was blocked.",
  };
  const stages = { setup: "Ready for service setup", starting: "Opening a temporary browser…", signin: "Sign into Clalit in the browser below", checking: "Checking supported medical-record sections…", checked: "Record access check completed", no_supported_records: "Signed-in menus found; no supported records were extracted", closed: "Session closed", close_unconfirmed: "Browser disconnected; remote termination unconfirmed" };
  async function request(path, data) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(csrf ? { "X-Pilot-CSRF": csrf } : {}), ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}) }, body: JSON.stringify(data || {}) });
    const body = await response.json();
    if (!response.ok) { const error = Error(body.error || "SERVICE_UNAVAILABLE"); error.diagnostic = body.provider_diagnostic; throw error; }
    return body;
  }
  function showError(error) { const target = $("controls").hidden ? $("global-error") : $("error"); target.textContent = errors[error.message] || "The test could not complete. No clinical content was saved."; target.hidden = false; if (error.diagnostic) $("diagnostic").textContent = "Service check: " + error.diagnostic.operation + " · HTTP " + error.diagnostic.http_status + " · " + (error.diagnostic.reason || ""); target.scrollIntoView({ block: "center", behavior: "smooth" }); }
  async function status() { const response = await fetch("/status", { headers: accessToken ? { Authorization: "Bearer " + accessToken } : {} }); const body = await response.json(); if (!response.ok) { const error = Error(body.error || "SERVICE_UNAVAILABLE"); error.diagnostic = body.provider_diagnostic; throw error; }
    return body; }
  function render(state) {
    if (!state.stage) return;
    currentState = state;
    $("start").textContent = busy || state.stage === "starting" ? "Opening Clalit browser…" : "Open Clalit browser";
    $("key").readOnly = busy || state.stage === "starting";
    $("key-check").disabled = busy || !["setup", "closed"].includes(state.stage);
    $("key-check").textContent = busy && state.stage !== "starting" ? "Checking…" : "Check Browserbase key";
    $("feedback").textContent = state.stage === "starting" ? "Connecting to Browserbase. The Clalit sign-in window will appear below." : state.error ? (errors[state.error] || "The browser could not open.") : "";
    $("stage").textContent = stages[state.stage] || "Waiting";
    $("loader").hidden = !["starting", "checking"].includes(state.stage);
    if (state.error) showError(Error(state.error));
    $("check").disabled = busy || !["signin", "checked", "no_supported_records"].includes(state.stage);
    $("start").disabled = busy || state.error === "CLALIT_ACCESS_BLOCKED" || !["setup", "closed"].includes(state.stage);
    $("close").disabled = state.stage === "setup" || (state.stage === "closed" && state.error !== "SESSION_RELEASE_FAILED");
    $("refresh").disabled = busy || ["setup", "closed", "close_unconfirmed", "starting"].includes(state.stage);
    $("results").hidden = !["checked", "no_supported_records"].includes(state.stage);
    if (!$("results").hidden) {
      $("counts").textContent = state.record_count + " supported records · " + state.entry_count + " entries";
      $("coverage").replaceChildren();
      for (const item of state.coverage || []) {
        const row = document.createElement("li");
        row.textContent = item.category.replaceAll("_", " ") + ": " + item.status + " (" + item.record_count + " records)";
        $("coverage").append(row);
      }
    }
    if (["closed", "close_unconfirmed"].includes(state.stage)) { $("viewer").removeAttribute("src"); $("browser").hidden = true; $("external").removeAttribute("href"); }
    $("expiry").textContent = state.expires_at ? "Automatic session end: " + new Date(state.expires_at).toLocaleTimeString() : "";
  }
  function view(state) {
    if (state.live_view_url) { $("viewer").src = state.live_view_url; $("external").href = state.live_view_url; $("browser").hidden = false; }
    render(state);
  }
  async function action(fn) {
    if (busy) return;
    busy = true; $("error").hidden = true; $("global-error").hidden = true; render(currentState);
    try { await fn(); } catch (error) { showError(error); }
    finally { busy = false; try { render(await status()); } catch (error) { render({ ...currentState, stage: "setup" }); showError(error); } }
  }
  $("key-check").onclick = () => action(async () => {
    const result = await request("/key-check", { api_key: $("key").value.trim() });
    $("key-status").textContent = result.project_ids.length ? "Browserbase accepted the key. Accessible projects: " + result.project_ids.length + "." : "Browserbase accepted the key, but no accessible project was returned. Finish creating your Browserbase project before starting a session.";
    if (!$("project").value && result.project_ids.length === 1) $("project").value = result.project_ids[0];
    $("diagnostic").textContent = "Key check: HTTP 200. No browser session was started.";
  });
  $("start").onclick = () => action(async () => {
    $("loader").hidden = false; $("stage").textContent = stages.starting;
    const key = $("key").value.trim();
    if (!key) throw Error("KEY_REQUIRED");
    if (!$("hosted").checked) throw Error("CONSENT_REQUIRED");
    render({ ...currentState, stage: "starting", error: null });
    $("status-panel").scrollIntoView({ block: "start", behavior: "smooth" });
    const result = await request("/start", { api_key: key, project_id: $("project").value.trim(), hosted_consent: $("hosted").checked });
    $("key").value = "";
    view(result);
    $("browser").scrollIntoView({ block: "start", behavior: "smooth" });
  });
  $("refresh").onclick = () => action(async () => view(await request("/view")));
  $("check").onclick = () => action(async () => render(await request("/check", { own_account: $("own").checked, read_consent: $("read").checked })));
  // Close is available even during an in-flight request.
  $("close").onclick = async () => { try { view(await request("/close")); } catch (error) { showError(error); } };
  window.addEventListener("message", (event) => {
    if (event.source === $("viewer").contentWindow && /^https:\/\/([a-z0-9-]+\.)*browserbase\.com$/.test(event.origin) && event.data === "browserbase-disconnected") {
      $("error").textContent = "The remote browser disconnected. Close this session and start again if needed."; $("error").hidden = false;
    }
  });
  (async () => {
    try {
      const capability = new URLSearchParams(location.hash.slice(1)).get("access");
      history.replaceState(null, "", "/");
      if (capability) { const reply = await request("/authorize", { capability }); csrf = reply.csrf; accessToken = reply.access_token; render(reply); }
      else throw Error("LOCAL_AUTH_REQUIRED");
      $("controls").hidden = false;
      polling = setInterval(async () => { try { render(await status()); } catch (error) { showError(error); clearInterval(polling); } }, 2000);
    } catch (error) { showError(error); }
  })();
  window.addEventListener("pagehide", () => clearInterval(polling));
}
export function remotePilotPage(nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CardioAhead · No-download Clalit test</title><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;background:#f3f6ef;color:#183d34;font:20px/1.6 system-ui,sans-serif}main{padding:28px;max-width:1500px;margin:auto}h1{font-size:clamp(28px,4vw,40px);line-height:1.2}h2{font-size:24px}.panel{background:#fff;border:1px solid #dce4d5;border-radius:20px;padding:24px;margin:20px 0}.notice{background:#e9efe2;padding:16px;border-radius:12px}label{display:block;margin:16px 0}input[type=password],input[type=text]{display:block;width:100%;max-width:640px;font:inherit;padding:12px;border:1px solid #9eac98;border-radius:10px}input[type=checkbox]{width:24px;height:24px;vertical-align:middle;margin-inline-end:8px}button,.link{font:inherit;display:inline-block;padding:14px 22px;border-radius:12px;border:1px solid #a5b89d;cursor:pointer;min-height:56px;margin:6px 8px 6px 0}button{background:#183d34;color:white;font-weight:650}button.secondary{background:white;color:#183d34}button:disabled{opacity:.5;cursor:default}a{color:#23483e}.actions{display:flex;flex-wrap:wrap;align-items:center}#error,#global-error{background:#fff1ea;color:#8e3b21;padding:18px;border:1px solid #e8b9a8;border-radius:12px}iframe{width:100%;height:800px;border:1px solid #c7d1c0;border-radius:12px;background:white}#loader{width:32px;height:32px;vertical-align:middle;animation:heartbeat 1.2s ease-in-out infinite;margin-right:10px}@keyframes heartbeat{0%,45%,100%{transform:scale(1)}15%,30%{transform:scale(1.18)}}@media(prefers-reduced-motion:reduce){#loader{animation:none}}small{display:block;font-size:17px;color:#516758}[hidden]{display:none!important}:focus-visible{outline:3px solid #b68a24;outline-offset:4px}@media(max-width:640px){main{padding:14px}.panel{padding:18px}button,.link{width:100%;text-align:center}iframe{height:640px}}
  </style></head><body><main><h1>Clalit import — no-download test</h1><p>A private test for your own account. The Clalit browser runs remotely; you do not install a collector.</p><p class="notice">This first test checks login and record access. It does not upload records into CardioAhead or send information to AI. Mobile login is not verified yet; start on your computer.</p><p id="global-error" role="alert" hidden></p><div id="controls" hidden><section class="panel"><h2>1. Connect the browser service</h2><p>One-time setup for you as the developer. Patients would not need an API key.</p><label>Browserbase API key<input id="key" type="password" autocomplete="off" spellcheck="false" data-1p-ignore></label><small>The key is used in memory for this test and is not saved to a file or browser storage.</small><label>Project ID (optional)<input id="project" type="text" autocomplete="off" spellcheck="false"></label><label><input id="hosted" type="checkbox">I agree to use Browserbase for this personal test. The remote service processes my Clalit login session and any displayed medical information.</label><p><small>The session requests recording and browser logging disabled, without a saved profile. This does not guarantee zero retention by Browserbase or Clalit. The session ends after 15 minutes.</small></p><p id="error" role="alert" hidden></p><button id="key-check" class="secondary">Check Browserbase key</button><p id="key-status" role="status"></p><small id="diagnostic"></small><button id="start">Open Clalit browser</button><p id="feedback" role="status"></p></section><section id="status-panel" class="panel" aria-live="polite"><svg id="loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" hidden><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg><strong id="stage">Ready for service setup</strong><small id="expiry"></small><div class="actions"><button class="secondary" id="refresh" disabled>Refresh browser view</button><button class="secondary" id="close" disabled>Close session &amp; clear</button></div></section><section id="browser" class="panel" hidden><h2>2. Sign into Clalit yourself</h2><p>Use the genuine Clalit page below, including any SMS code. Select your own profile. Do not send your login details to Codex.</p><iframe id="viewer" title="Temporary remote Clalit browser" sandbox="allow-same-origin allow-scripts" referrerpolicy="no-referrer"></iframe><a id="external" class="link" target="_blank" rel="noopener noreferrer">Open browser in a larger window</a><p><small>If Clalit blocks the session or requires an unsupported step, stop here. This pilot does not bypass access checks.</small></p><h2>3. Check record access</h2><label><input id="own" type="checkbox">I am signed in and selected my own profile.</label><label><input id="read" type="checkbox">Allow the agent to read supported medical sections temporarily, report counts and clear the extracted text. Nothing will be uploaded or sent to AI.</label><button id="check" disabled>Check my record access</button></section><section id="results" class="panel" hidden><h2>Access check result</h2><strong id="counts"></strong><ul id="coverage"></ul><p>Extracted text has been cleared. These counts do not mean the complete medical file was read. A visit or imaging listing is not treated as the full report.</p><p>The next decision is whether this login flow is simple enough before connecting it to patient invitations.</p></section></div></main><script nonce="${nonce}">(${setupPage.toString()})();</script></body></html>`;
}