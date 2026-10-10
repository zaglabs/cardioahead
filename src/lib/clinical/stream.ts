import { classifyProviderFailure, classifyTransportFailure } from "./errors";
type ClaudeMessage = {
  stop_reason: string | null;
  content: { type: string; text: string }[];
};
export async function readClaudeMessage(
  response: Response,
): Promise<ClaudeMessage> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    try {
      return await response.json();
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("AI_INVALID_RESPONSE");
      throw new Error(classifyTransportFailure(e));
    }
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI_INCOMPLETE");
  const decoder = new TextDecoder(),
    blocks = new Map<number, { type: string; text: string }>();
  let buffer = "",
    stop: string | null = null,
    complete = false,
    started = false,
    total = 0;
  function event(frame: string) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    let e;
    try {
      e = JSON.parse(data);
    } catch {
      throw new Error("AI_INVALID_RESPONSE");
    }
    if (e.type === "error")
      throw new Error(
        classifyProviderFailure(
          e.error?.type === "overloaded_error" ? 529 : 500,
          e,
        ),
      );
    if (e.type === "message_start") {
      started = true;
      stop = e.message?.stop_reason || null;
    }
    if (e.type === "content_block_start" && Number.isInteger(e.index))
      blocks.set(e.index, {
        type: e.content_block?.type || "",
        text: e.content_block?.text || "",
      });
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
      const block = blocks.get(e.index);
      if (!block || block.type !== "text" || typeof e.delta.text !== "string")
        throw new Error("AI_INVALID_RESPONSE");
      block.text += e.delta.text;
    }
    if (e.type === "message_delta") stop = e.delta?.stop_reason || stop;
    if (e.type === "message_stop") complete = true;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 2000000) throw new Error("AI_INVALID_RESPONSE");
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        event(buffer.slice(0, split));
        buffer = buffer.slice(split + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    if (!started || !complete || stop !== "end_turn")
      throw new Error("AI_INCOMPLETE");
    return {
      stop_reason: stop,
      content: [...blocks.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, block]) => block),
    };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (
      name === "AbortError" ||
      name === "TimeoutError" ||
      e instanceof TypeError
    )
      throw new Error(classifyTransportFailure(e));
    throw e;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
