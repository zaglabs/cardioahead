import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { classifyProviderFailure, classifyTransportFailure } from "./errors";
export function anthropicEndpoint(path: string) {
  if (localTestMode() && process.env.CARDIOAHEAD_TEST_OPENAI_URL) {
    const u = new URL(process.env.CARDIOAHEAD_TEST_OPENAI_URL);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1")
      throw new Error("INVALID_TEST_AI_ENDPOINT");
    u.pathname = "/" + path.split("?")[0];
    u.search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    return u.toString();
  }
  return "https://api.anthropic.com/v1/" + path;
}
async function request(path: string, body?: unknown) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI_NOT_CONFIGURED");
  let response;
  try {
    response = await fetch(anthropicEndpoint(path), {
      method: body ? "POST" : "GET",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(body ? 35000 : 15000),
    });
  } catch (e) {
    throw new Error(classifyTransportFailure(e));
  }
  if (!response.ok)
    throw new Error(
      classifyProviderFailure(
        response.status,
        await response.json().catch(() => null),
      ),
    );
  return response.json();
}
export async function availableAnthropicModels(): Promise<
  { id: string; name: string }[]
> {
  const result = await request("models?limit=100");
  if (!Array.isArray(result.data)) throw new Error("AI_INVALID_RESPONSE");
  return result.data
    .filter(
      (m: {
        id?: string;
        lifecycle?: string;
        capabilities?: {
          structured_outputs?: { supported: boolean };
          pdf_input?: { supported: boolean };
        };
      }) =>
        /^claude-[a-z0-9-]{1,100}$/.test(m.id || "") &&
        m.lifecycle !== "retired" &&
        m.capabilities?.structured_outputs?.supported !== false &&
        m.capabilities?.pdf_input?.supported !== false,
    )
    .map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      name: m.display_name || m.id,
    }));
}
export async function probeAnthropicModel(model: string) {
  const result = await request("messages", {
    model,
    max_tokens: 32,
    messages: [
      { role: "user", content: "Connection test. Return ok as true." },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    },
  });
  if (result.stop_reason !== "end_turn") throw new Error("AI_INCOMPLETE");
  const text = result.content
    ?.filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
  try {
    if (JSON.parse(text).ok !== true) throw new Error();
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }
}
