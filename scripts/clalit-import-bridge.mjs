import { renderCollectorPage } from "./clalit-collector-page.mjs";
// Loopback-only pairing; upload capability comes from the authenticated owner in CardioAhead.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
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
export async function startImportBridge(port = 3184, handlers = {}) {
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
        response.end(
          renderCollectorPage(state.nonce, Boolean(handlers.openClalit)),
        );
        return;
      }
      if (
        request.method !== "POST" ||
        ![
          "/status",
          "/transfer",
          "/start-clalit",
          "/collect",
          "/close",
        ].includes(route) ||
        request.headers.origin !== bridgeOrigin ||
        !equal(request.headers["x-collector-nonce"], state.nonce)
      ) {
        reply(response, 403, {
          message: "Private collector connection required.",
        });
        return;
      }
      const data = await input(request);
      if (route === "/close") {
        clearCollectedRecords();
        reply(response, 200, { ok: true });
        if (handlers.close) void handlers.close();
        return;
      }
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
      const scope = createHash("sha256").update(data.token).digest("hex");
      if (state.retired_bindings?.has(scope)) {
        reply(response, 409, {
          message:
            "This connection was replaced. Close this window and use the new connection.",
        });
        return;
      }
      const differentScope =
        state.active_binding && state.active_binding !== scope;
      if (
        differentScope &&
        (!handlers.cancel ||
          collectedCounts().record_count > 0 ||
          state.running ||
          state.workflow?.stage === "collecting")
      ) {
        reply(response, 409, {
          message:
            "Close this collector and restart it before connecting a different invitation.",
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
        if (check.status === 401) {
          clearCollectedRecords();
          if (handlers.cancel) void handlers.cancel();
        }
        reply(response, 401, {
          message:
            "The CardioAhead connection expired. Create a new connection in your personal card.",
        });
        return;
      }
      if (differentScope) {
        await handlers.cancel();
        (state.retired_bindings ||= new Set()).add(state.active_binding);
      }
      state.active_binding = scope;
      if (route === "/start-clalit" || route === "/collect") {
        if (state.running || state.workflow?.stage === "collecting") {
          reply(response, 409, { message: "Collection is already running." });
          return;
        }
        if (!handlers.openClalit || !handlers.collect) {
          reply(response, 409, {
            message:
              "Start the updated desktop collector to use the guided controls.",
          });
          return;
        }
        if (route === "/start-clalit") {
          await handlers.openClalit();
          reply(response, 200, { ok: true });
          return;
        }
        if (data.own_account !== true) {
          reply(response, 400, {
            message: "Confirm that you selected your own Clalit profile.",
          });
          return;
        }
        state.workflow = { stage: "collecting" };
        reply(response, 202, { ok: true });
        void handlers.collect().catch(() => {
          state.workflow = { stage: "error" };
          clearCollectedRecords();
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
          workflow: state.workflow || { stage: "manual" },
        });
        return;
      }
      if (route === "/status") {
        reply(response, 200, {
          target,
          counts: collectedCounts(),
          manifest: collectedManifest(),
          workflow: state.workflow || { stage: "manual" },
        });
        return;
      }
      if (collectedCounts().running || state.workflow?.stage === "collecting") {
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
  if (state.server)
    await new Promise((resolve) => {
      const server = state.server,
        timer = setTimeout(() => {
          server.closeAllConnections();
          resolve();
        }, 2000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
      server.closeIdleConnections();
    });
  state.server = null;
  state.nonce = null;
  state.import_status = null;
  state.active_binding = null;
  state.retired_bindings = null;
  state.workflow = null;
  state.bridge_status_monitor = false;
}
