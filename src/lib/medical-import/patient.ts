import "server-only";
import { localTestMode, configured } from "@/lib/portal/config";
import { personalClaudeConfigured } from "./engine";
export function patientClalitEnabled() {
  return (
    configured() &&
    personalClaudeConfigured() &&
    (localTestMode() ||
      process.env.CARDIOAHEAD_ENABLE_PATIENT_CLALIT_PILOT === "true")
  );
}
