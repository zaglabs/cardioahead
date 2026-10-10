import {
  requireAdmin,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
import {
  claudeModel,
  readAISettings,
  saveClaudeModel,
} from "@/lib/clinical/settings";
import { selectedProvider } from "@/lib/clinical/provider";
import {
  availableAnthropicModels,
  probeAnthropicModel,
} from "@/lib/clinical/anthropic-admin";
import { AI_FAILURE_MESSAGES } from "@/lib/clinical/errors";
export const maxDuration = 60;
export async function GET() {
  try {
    await requireAdmin();
    const stored = await readAISettings();
    return json({
      provider: selectedProvider(),
      key_configured: Boolean(process.env.ANTHROPIC_API_KEY),
      masked_key: process.env.ANTHROPIC_API_KEY ? "••••••••••••••••" : "",
      processing_enabled:
        process.env.CARDIOAHEAD_ENABLE_CLAUDE_TEST_PDFS === "true",
      model: await claudeModel(),
      storage_ready: stored.ready,
      updated_at: stored.value?.updated_at || null,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  let models: { id: string; name: string }[] | undefined;
  try {
    sameOrigin(request);
    const actor = await requireAdmin(),
      input = await body(request);
    if (!["check", "save"].includes(String(input.action)))
      throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    models = await availableAnthropicModels();
    const model =
      typeof input.model === "string" ? input.model : await claudeModel();
    if (
      typeof model !== "string" ||
      !models.some((m: { id: string }) => m.id === model)
    )
      throw new Error("AI_MODEL_UNAVAILABLE");
    await probeAnthropicModel(model);
    if (input.action === "save") await saveClaudeModel(actor.id, model);
    return json({
      ok: true,
      models,
      model,
      checked_at: new Date().toISOString(),
      connection: "connected",
    });
  } catch (e) {
    if (e instanceof Error && AI_FAILURE_MESSAGES[e.message]) {
      const response = await failure(
        new PortalError(503, e.message, AI_FAILURE_MESSAGES[e.message]),
      );
      return json(
        { ...(await response.json()), ...(models ? { models } : {}) },
        503,
      );
    }
    return failure(e);
  }
}
