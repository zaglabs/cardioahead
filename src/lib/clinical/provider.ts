import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { summarySchema } from "./schema";
export type AIProvider = "openai" | "claude";
export function selectedProvider(): AIProvider {
  const choice = process.env.CARDIOAHEAD_AI_PROVIDER;
  if (choice === "claude" || choice === "openai") return choice;
  return process.env.ANTHROPIC_API_KEY ? "claude" : "openai";
}
export function providerConfigured() {
  const provider = selectedProvider();
  return provider === "claude"
    ? Boolean(
        process.env.ANTHROPIC_API_KEY &&
        process.env.CARDIOAHEAD_ENABLE_CLAUDE_TEST_PDFS === "true",
      )
    : Boolean(
        process.env.OPENAI_API_KEY &&
        process.env.CARDIOAHEAD_ENABLE_OPENAI_TEST_PDFS === "true",
      );
}
function url(provider: AIProvider) {
  if (localTestMode() && process.env.CARDIOAHEAD_TEST_OPENAI_URL) {
    const endpoint = new URL(process.env.CARDIOAHEAD_TEST_OPENAI_URL);
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1")
      throw new Error("INVALID_TEST_AI_ENDPOINT");
    if (provider === "claude") endpoint.pathname = "/messages";
    return endpoint.toString();
  }
  return provider === "claude"
    ? "https://api.anthropic.com/v1/messages"
    : "https://api.openai.com/v1/responses";
}
// Anthropic accepts a reduced schema. The original constraints are still checked locally.
function claudeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(claudeSchema);
  if (value && typeof value === "object") {
    const ignored = [
      "minimum",
      "maximum",
      "minLength",
      "maxLength",
      "maxItems",
    ];
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, v]) =>
            !ignored.includes(key) &&
            !(key === "minItems" && typeof v === "number" && v > 1),
        )
        .map(([k, v]) => [k, claudeSchema(v)]),
    );
  }
  return value;
}
export async function requestClinicalSummary(
  instructions: string,
  content: Record<string, unknown>[],
) {
  if (!providerConfigured()) throw new Error("AI_NOT_CONFIGURED");
  const provider = selectedProvider();
  const model =
    provider === "claude"
      ? process.env.CLAUDE_MODEL || "claude-sonnet-4-6"
      : process.env.OPENAI_MODEL || "gpt-5.4";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: unknown;
  if (provider === "claude") {
    headers["x-api-key"] = process.env.ANTHROPIC_API_KEY!;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: 18000,
      system: instructions,
      messages: [
        {
          role: "user",
          content: content.map((item, i) =>
            item.type === "input_file"
              ? {
                  type: "document",
                  title: "Source " + i,
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: String(item.file_data).split(",")[1],
                  },
                }
              : { type: "text", text: item.text },
          ),
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: claudeSchema(summarySchema) },
      },
    };
  } else {
    headers.Authorization = "Bearer " + process.env.OPENAI_API_KEY!;
    body = {
      model,
      store: false,
      instructions,
      input: [{ role: "user", content }],
      max_output_tokens: 18000,
      text: {
        format: {
          type: "json_schema",
          name: "cardiology_previsit",
          strict: true,
          schema: summarySchema,
        },
      },
    };
  }
  const response = await fetch(url(provider), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(160000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "AI_KEY_INVALID"
        : response.status === 429
          ? "AI_RATE_LIMIT"
          : "AI_PROVIDER_ERROR",
    );
  const result = await response.json();
  let text: string;
  if (provider === "claude") {
    if (result.stop_reason !== "end_turn" || !Array.isArray(result.content))
      throw new Error("AI_INCOMPLETE");
    text = result.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");
  } else {
    if (result.status !== "completed" || !Array.isArray(result.output))
      throw new Error("AI_INCOMPLETE");
    const messages = result.output.flatMap(
      (o: { type?: string; content?: { type: string; text?: string }[] }) =>
        o.type === "message" ? o.content || [] : [],
    );
    if (messages.some((c: { type: string }) => c.type === "refusal"))
      throw new Error("AI_REFUSAL");
    text = messages
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text: string }) => c.text)
      .join("");
  }
  return { value: JSON.parse(text), model };
}
