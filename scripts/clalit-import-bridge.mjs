// Loopback-only pairing; upload capability comes from the authenticated owner in CardioAhead.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  collectorState,
  selectedBundle,
  collectedManifest,
  collectedCounts,
  clearCollectedRecords,
} from "./clalit-import-state.mjs";
const endpoint =
  "https://www.cardioahead.com/api/clinic/medical-imports/upload";
function equal(a, b) {
  const left = Buffer.from(a || ""),
    right = Buffer.from(b || "");
  return left.length === right.length && timingSafeEqual(left, right);
}
function reply(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
async function input(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 12000) throw new Error("BODY_LIMIT");
  }
  return JSON.parse(text);
}
function page(nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CardioAhead — local collector</title><style>body{font:18px/1.7 system-ui;background:#f3f6ef;color:#183c31;margin:0;padding:clamp(20px,4vw,48px)}main{max-width:1080px;margin:auto;background:white;padding:clamp(20px,4vw,40px);border:1px solid #dce4d7;border-radius:24px}button{font:inherit;cursor:pointer;background:#173f33;color:white;border:0;padding:14px 22px;border-radius:12px}button:disabled{opacity:.5;cursor:wait}.note{background:#f3f6ef;padding:16px;border-radius:14px}.error{color:#9b4025}#heart{display:inline-block;animation:beat 1.35s infinite;transform-origin:center}@keyframes beat{0%,40%,100%{transform:scale(1)}12%{transform:scale(1.18)}22%{transform:scale(.99)}30%{transform:scale(1.12)}}@media(prefers-reduced-motion:reduce){#heart{animation:none}}</style></head><body><main><h1>CardioAhead local collector</h1><p>The collector reads your own Clalit account after you sign in. Original documents remain in Clalit. CardioAhead saves the pre-visit summary, source references and short supporting excerpts.</p><p class="note" id="target">Validating the private connection…</p><p id="counts"></p><fieldset id="sources"><legend>Review the sources to import</legend><div id="manifest"></div></fieldset><p id="status" role="status" aria-live="polite"><span id="heart">♡</span> Preparing the connection.</p><button id="transfer" disabled>Import selected records into CardioAhead</button><p id="error" class="error" role="alert"></p><p>Do not enter your Clalit password, ID or login codes here. After importing, the summary continues in CardioAhead. You can close this window.</p></main><script nonce="${nonce}">
let token=new URLSearchParams(location.hash.slice(1)).get('token') || '';history.replaceState(null,'','/connect');let inFlight=false,manifestKey='';
const nonce=${JSON.stringify(nonce)},status=document.getElementById('status'),error=document.getElementById('error'),button=document.getElementById('transfer');
async function call(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Collector-Nonce':nonce},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.message || 'The connection could not be completed.');return data;}
function loading(){if(!document.getElementById('heart')){const heart=document.createElement('span');heart.id='heart';heart.textContent='♡ ';heart.setAttribute('aria-hidden','true');status.prepend(heart);}} async function refresh(){if(inFlight)return;try{const data=await call('/status',{token});document.getElementById('target').textContent='Patient card: '+data.target.patient_label+' · '+(data.target.claude_consent?'Claude processing approved':'References only; Claude processing off');document.getElementById('counts').textContent=data.counts.record_count+' source records / '+data.counts.entry_count+' entries collected temporarily. '+data.counts.categories.join(', ');const records=data.manifest || [],key=records.map(record=>record.id).join(',');if(key!==manifestKey){manifestKey=key;const list=document.getElementById('manifest');list.replaceChildren();for(const record of records){const label=document.createElement('label');label.style.display='block';label.style.margin='12px 0';const box=document.createElement('input');box.type='checkbox';box.checked=true;box.value=record.id;box.style.marginInlineEnd='12px';label.append(box,document.createTextNode(record.title+' · '+(record.record_date || 'Date not identified')+' · '+record.entry_count+' entries'+(record.association_verified?'':' · Source association needs review')));list.append(label);}}button.disabled=!data.counts.record_count || data.counts.running || ['received','generating','ready'].includes(data.target.status);status.textContent=data.target.status==='ready'?'Summary saved in CardioAhead. Temporary collected text has been cleared.':data.target.status==='generating'?'Claude is preparing the source-cited draft.':data.target.status==='failed'?'Processing failed. Create a new connection in CardioAhead and collect again.':'Finish signing into Clalit and collecting your own records; then import.';if(data.target.status==='ready')button.disabled=true;if(data.counts.running || ['received','generating'].includes(data.target.status))loading();}catch(reason){error.textContent=reason.message;button.disabled=true;}}
button.onclick=async()=>{inFlight=true;button.disabled=true;error.textContent='';try{const data=await call('/transfer',{token,source_ids:[...document.querySelectorAll('#manifest input:checked')].map(box=>box.value)});status.textContent=data.queued?'Source references received. Claude processing is starting.':'Source references saved; no AI processing requested.';if(data.queued)loading();}catch(reason){error.textContent=reason.message;}finally{inFlight=false;await refresh();}};void refresh();setInterval(refresh,5000);
</script></body></html>`;
}
export async function startImportBridge(port = 3184) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("INVALID_LOOPBACK_PORT");
  const bridgeOrigin = "http://127.0.0.1:" + port;
  const state = collectorState();
  if (state.server) return { port, running: true };
  state.nonce = randomBytes(24).toString("base64url");
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== "127.0.0.1:" + port) {
        reply(response, 403, { message: "Host not allowed." });
        return;
      }
      const route = new URL(request.url, bridgeOrigin).pathname;
      if (request.method === "GET" && route === "/connect") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${state.nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(page(state.nonce));
        return;
      }
      if (
        request.method !== "POST" ||
        !["/status", "/transfer"].includes(route) ||
        request.headers.origin !== bridgeOrigin ||
        !equal(request.headers["x-collector-nonce"], state.nonce)
      ) {
        reply(response, 403, {
          message: "Private collector connection required.",
        });
        return;
      }
      const data = await input(request);
      if (
        typeof data.token !== "string" ||
        !/^[A-Za-z0-9_-]{40,80}$/.test(data.token)
      ) {
        reply(response, 401, {
          message:
            "Open the connection from your own patient card in CardioAhead.",
        });
        return;
      }
      const headers = { Authorization: "Bearer " + data.token };
      const check = await fetch(endpoint, {
        headers,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const target = await check.json();
      if (
        !check.ok ||
        target.subject_scope !== "self" ||
        target.provider !== "clalit"
      ) {
        reply(response, 401, {
          message:
            "The CardioAhead connection expired. Create a new connection in your personal card.",
        });
        return;
      }
      state.import_status = {
        status: target.status,
        claude_consent: target.claude_consent === true,
        error_code: target.error_code || null,
        checked_at: new Date().toISOString(),
      };
      if (target.status === "ready") {
        // A completed old connection must not erase a later collection pass.
        reply(response, 200, {
          target,
          counts: collectedCounts(),
          manifest: collectedManifest(),
        });
        return;
      }
      if (route === "/status") {
        reply(response, 200, {
          target,
          counts: collectedCounts(),
          manifest: collectedManifest(),
        });
        return;
      }
      if (collectedCounts().running) {
        reply(response, 409, {
          message:
            "Collection is still running. Wait for it to finish before importing.",
        });
        return;
      }
      const bundle = selectedBundle(data.source_ids);
      const sent = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      const receipt = await sent.json();
      if (!sent.ok) {
        reply(response, 502, {
          message:
            "The private import could not be accepted. Check the CardioAhead connection and collection status.",
        });
        return;
      }
      // The server has accepted its transient processing copy; erase local source text now.
      clearCollectedRecords();
      reply(response, 200, receipt);
    } catch {
      reply(response, 503, {
        message:
          "The local collection or private connection is unavailable. Collect your own records and reconnect.",
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  server.unref();
  state.server = server;
  return { port, running: true };
}
export async function stopImportBridge() {
  const state = collectorState();
  clearCollectedRecords();
  await new Promise((resolve) =>
    state.server ? state.server.close(resolve) : resolve(),
  );
  state.server = null;
  state.nonce = null;
  state.import_status = null;
  state.bridge_status_monitor = false;
}
