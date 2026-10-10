// Metadata-only status tracking for the local bridge. Never retains request bodies,
// capability tokens, source titles, medical values or patient labels.
import { collectorState } from "./clalit-import-state.mjs";
export function monitorImportStatus() {
  const state = collectorState();
  if (!state.server || state.bridge_status_monitor) return;
  state.bridge_status_monitor = true;
  state.server.on("request", (request, response) => {
    if (
      request.method !== "POST" ||
      !["/status", "/transfer"].includes(request.url)
    )
      return;
    const end = response.end.bind(response);
    response.end = (chunk, ...args) => {
      try {
        const packet = JSON.parse(
          typeof chunk === "string" ? chunk : chunk?.toString("utf8") || "{}",
        );
        if (response.statusCode === 200 && packet.target)
          state.import_status = {
            status: packet.target.status,
            claude_consent: packet.target.claude_consent === true,
            error_code: packet.target.error_code || null,
            checked_at: new Date().toISOString(),
          };
        if (response.statusCode === 200 && Object.hasOwn(packet, "queued"))
          state.import_status = {
            status: packet.queued
              ? "submitted_for_processing"
              : "references_saved",
            claude_consent: packet.queued === true,
            error_code: null,
            checked_at: new Date().toISOString(),
          };
      } catch {}
      return end(chunk, ...args);
    };
  });
}
