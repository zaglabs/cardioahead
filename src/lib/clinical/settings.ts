import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { localTransaction } from "@/lib/portal/local-store";
import { supabaseAdmin } from "@/lib/portal/store";
import { PortalError } from "@/lib/portal/security";
export type AISettings = {
  model_id: string;
  updated_at: string;
  updated_by: string;
};
let warned = false;
export async function readAISettings() {
  if (localTestMode())
    return localTransaction((s) => ({
      ready: true,
      value: s.aiSettings || null,
    }));
  const result = await supabaseAdmin()
    .from("clinic_ai_settings")
    .select("*")
    .eq("provider", "anthropic")
    .maybeSingle();
  if (result.error) {
    if (!["42P01", "PGRST205"].includes(result.error.code))
      throw new Error("AI_SETTINGS_UNAVAILABLE");
    if (!warned) {
      warned = true;
      console.warn("AI settings unavailable; environment model retained");
    }
    return { ready: false, value: null };
  }
  return { ready: true, value: result.data as AISettings | null };
}
export async function claudeModel() {
  const settings = await readAISettings();
  return (
    settings.value?.model_id || process.env.CLAUDE_MODEL || "claude-sonnet-4-6"
  );
}
export async function saveClaudeModel(actor: string, model: string) {
  if (!/^claude-[a-z0-9-]{1,100}$/.test(model))
    throw new PortalError(400, "BAD_MODEL", "בחרו מודל מהרשימה.");
  if (localTestMode())
    return localTransaction((s) => {
      if (
        !s.staff.some(
          (a) =>
            a.id === actor &&
            a.email === "galadv73@gmail.com" &&
            a.role === "admin" &&
            a.status === "active",
        )
      )
        throw new PortalError(
          403,
          "ADMIN_REQUIRED",
          "הפעולה זמינה למנהל המערכת בלבד.",
        );
      s.aiSettings = {
        model_id: model,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      };
      s.audit.push({
        event: "anthropic_model_changed",
        actor_id: actor,
        details: { model_id: model },
        at: new Date().toISOString(),
      });
      return s.aiSettings;
    });
  const result = await supabaseAdmin().rpc("set_clinic_ai_model", {
    p_actor: actor,
    p_model: model,
  });
  if (result.error)
    throw new PortalError(
      503,
      "AI_SETTINGS_STORAGE",
      "יש להחיל את עדכון מסד הנתונים להגדרות AI.",
    );
  return result.data as AISettings;
}
