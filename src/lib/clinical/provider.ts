import { claudeModel } from "./settings";
import { readClaudeMessage } from "./stream";
import { claudeSummarySchema, normalizeClaudeSummary } from "./claude-schema";
import { classifyProviderFailure, classifyTransportFailure } from "./errors";
import "server-only";
import { localTestMode } from "@/lib/portal/config";
import { summarySchema } from "./schema";
async function fetchProvider(endpoint: string, options: RequestInit) {
  try {
    return await fetch(endpoint, options);
  } catch (error) {
    throw new Error(classifyTransportFailure(error));
  }
}
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
export async function requestClinicalSummary(
  instructions: string,
  content: Record<string, unknown>[],
  timeoutMs = 160000,
) {
  if (!providerConfigured()) throw new Error("AI_NOT_CONFIGURED");
  const provider = selectedProvider();
  const model =
    provider === "claude"
      ? await claudeModel()
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
      stream: true,
      max_tokens: 18000,
      system:
        instructions +
        '\nClaude wire format: date must be an empty string when not documented; key_value must be {he: "", en: ""} when there is no documented measurement. Quotes must be at most 350 characters. This replaces null placeholders only; preserve all clinical uncertainty and citations.',
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
        format: { type: "json_schema", schema: claudeSummarySchema },
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
  const response = await fetchProvider(url(provider), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = classifyProviderFailure(response.status, payload);
    console.error(
      "AI request rejected",
      JSON.stringify({ provider, status: response.status, code }),
    );
    throw new Error(code);
  }
  const result =
    provider === "claude"
      ? await readClaudeMessage(response)
      : await response.json().catch(() => {
          throw new Error("AI_INVALID_RESPONSE");
        });
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
  const value = JSON.parse(text);
  return {
    value: provider === "claude" ? normalizeClaudeSummary(value) : value,
    model,
  };
}

export async function requestEvidenceJSON(
  name: string,
  instructions: string,
  payload: unknown,
  schema: Record<string, unknown>,
  documents: Record<string, unknown>[] = [],
  timeoutMs = 75000,
) {
  if (!providerConfigured()) throw new Error("AI_NOT_CONFIGURED");
  const provider = selectedProvider(),
    model =
      provider === "claude"
        ? await claudeModel()
        : process.env.OPENAI_MODEL || "gpt-5.4";
  const content = [
    { type: "input_text", text: JSON.stringify(payload) },
    ...documents,
  ];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let requestBody: unknown;
  if (provider === "claude") {
    headers["x-api-key"] = process.env.ANTHROPIC_API_KEY!;
    headers["anthropic-version"] = "2023-06-01";
    requestBody = {
      model,
      stream: true,
      max_tokens: /verification/.test(name) ? 5000 : 6500,
      system: instructions,
      messages: [
        {
          role: "user",
          content: content.map((item) =>
            item.type === "input_file"
              ? {
                  type: "document",
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
      output_config: { format: { type: "json_schema", schema } },
    };
  } else {
    headers.Authorization = "Bearer " + process.env.OPENAI_API_KEY!;
    requestBody = {
      model,
      store: false,
      instructions,
      input: [{ role: "user", content }],
      max_output_tokens: 10000,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    };
  }
  const response = await fetchProvider(url(provider), {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(
      classifyProviderFailure(
        response.status,
        await response.json().catch(() => null),
      ),
    );
  const result =
    provider === "claude"
      ? await readClaudeMessage(response)
      : await response.json().catch(() => {
          throw new Error("AI_INVALID_RESPONSE");
        });
  if (
    provider === "claude"
      ? result.stop_reason !== "end_turn"
      : result.status !== "completed"
  )
    throw new Error("AI_INCOMPLETE");
  const blocks =
    provider === "claude"
      ? result.content
      : result.output?.flatMap((o: { type: string; content?: unknown[] }) =>
          o.type === "message" ? o.content || [] : [],
        );
  if (!Array.isArray(blocks)) throw new Error("AI_INCOMPLETE");
  const output = blocks
    .filter(
      (c: { type: string }) => c.type === "text" || c.type === "output_text",
    )
    .map((c: { text: string }) => c.text)
    .join("");
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }
  return { value, model };
}
