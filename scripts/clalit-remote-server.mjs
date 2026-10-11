import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { remotePilotPage } from "./clalit-remote-page.mjs";
import { createRemoteClalitPilot, safePilotError } from "./clalit-remote-runtime.mjs";
function same(a, b) { return typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
async function jsonBody(req) {
  let text = "";
  for await (const part of req) { text += part; if (Buffer.byteLength(text) > 4096) throw Error("BODY_LIMIT"); }
  return JSON.parse(text || "{}");
}
export async function createRemotePilotServer({ port = 3194, pilot = createRemoteClalitPilot() } = {}) {
  const capability = randomBytes(32).toString("hex"), cookie = randomBytes(32).toString("hex"), csrf = randomBytes(32).toString("hex");
  let origin, authorized = false, authorizations = 0;
  let lastRequest = null;
  const diagnosticStatus = () => ({ ...pilot.status(), last_request: lastRequest });
  const send = (res, code, data) => { if (res.pilotPath === "/start") lastRequest = { action: "start", http_status: code, error: data.error || null, at: new Date().toISOString() }; res.writeHead(code, { "Content-Type": "application/json;charset=utf-8" }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.headers.host !== new URL(origin).host) return send(res, 403, { error: "LOCAL_HOST_REQUIRED" });
    const path = new URL(req.url, origin).pathname; res.pilotPath = path;
    try {
      if (req.method === "GET" && path === "/") {
        const nonce = randomBytes(24).toString("base64");
        res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; frame-src https://browserbase.com https://*.browserbase.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
        res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
        res.end(remotePilotPage(nonce)); return;
      }
      if (req.method === "POST" && req.headers.origin !== origin) return send(res, 403, { error: "ORIGIN_DENIED" });
      if (req.method === "POST" && path === "/authorize") {
        if (++authorizations > 20) return send(res, 429, { error: "LOCAL_RATE_LIMIT" });
        const body = await jsonBody(req);
        if (!same(body.capability, capability)) return send(res, 403, { error: "LOCAL_AUTH_REQUIRED" });
        authorized = true;
        res.setHeader("Set-Cookie", "remote_pilot=" + cookie + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600");
        return send(res, 200, { csrf, access_token: cookie, ...diagnosticStatus() });
      }
      const match = /(?:^|;\s*)remote_pilot=([^;]+)/.exec(req.headers.cookie || "");
      const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
      if (!authorized || (!same(match?.[1], cookie) && !same(bearer?.[1], cookie))) return send(res, 401, { error: "LOCAL_AUTH_REQUIRED" });
      if (req.method === "GET" && path === "/status") return send(res, 200, diagnosticStatus());
      if (req.method !== "POST" || !same(req.headers["x-pilot-csrf"], csrf)) return send(res, 403, { error: "CSRF_DENIED" });
      if (path === "/key-check") { const body = await jsonBody(req); return send(res, 200, await pilot.checkKey({ api_key: body.api_key })); }
      if (path === "/start") { const body = await jsonBody(req); return send(res, 200, await pilot.start({ api_key: body.api_key, project_id: body.project_id, hosted_consent: body.hosted_consent })); }
      if (path === "/view") return send(res, 200, await pilot.liveView());
      if (path === "/check") {
        const body = await jsonBody(req);
        // Respond immediately and expose genuine stages via status polling. No pretend progress percentage.
        const pending = pilot.check({ own_account: body.own_account, read_consent: body.read_consent });
        pending.catch(() => {});
        if (pilot.status().stage !== "checking") return send(res, 200, await pending);
        return send(res, 202, pilot.status());
      }
      if (path === "/close") { await pilot.close(); return send(res, 200, pilot.status()); }
      return send(res, 404, { error: "NOT_FOUND" });
    } catch (error) { send(res, 400, { error: safePilotError(error), provider_diagnostic: pilot.status().provider_diagnostic }); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  origin = "http://127.0.0.1:" + server.address().port;
  const close = async () => { await pilot.close(); await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); server.closeAllConnections(); }); };
  return { url: origin + "/#access=" + capability, origin, close, pilot };
}