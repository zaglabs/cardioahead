import { createHash } from "node:crypto";
import { collectorState, collectedCounts } from "./clalit-import-state.mjs";
const endpoint = "https://www.cardioahead.com/api/clinic/medical-imports/upload";
export function stopCompletionCheck() {
  const state = collectorState();
  clearInterval(state.completion_check);
  clearTimeout(state.completion_close);
  state.completion_check = null;
  state.completion_close = null;
  state.submitted_binding = null;
  state.cleanup_pending = false;
}
export function startCompletionCheck(token, handlers, { pollIntervalMs = 5000, completionGraceMs = 10000 } = {}) {
  if (!handlers.close) return;
  stopCompletionCheck();
  const state = collectorState(), scope = createHash("sha256").update(token).digest("hex");
  state.submitted_binding = scope;
  let checking = false;
  const stillCurrent = () => state.active_binding === scope && state.submitted_binding === scope;
  async function check() {
    if (checking || !stillCurrent()) return;
    checking = true;
    try {
      const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      const target = await response.json();
      if (!stillCurrent() || !response.ok || target.provider !== "clalit" || target.subject_scope !== "self") return;
      if (target.status === "failed") { clearInterval(state.completion_check); state.completion_check = null; return; }
      if (target.status !== "ready" || state.running || state.workflow?.stage === "collecting" || collectedCounts().record_count) return;
      state.cleanup_pending = true;
      clearInterval(state.completion_check); state.completion_check = null;
      state.completion_close = setTimeout(() => {
        if (stillCurrent() && !state.running && state.workflow?.stage !== "collecting" && !collectedCounts().record_count) void handlers.close();
      }, completionGraceMs);
      state.completion_close.unref();
    } catch { /* A network failure does not establish a completed import. */ }
    finally { checking = false; }
  }
  state.completion_check = setInterval(() => void check(), pollIntervalMs);
  state.completion_check.unref();
}