import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseE2BSandboxStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[paperclip]")) {
    return [{ kind: "system", ts, text: trimmed }];
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.type === "assistant" && typeof parsed.message === "string") {
        return [{ kind: "assistant", ts, text: parsed.message }];
      }
      if (parsed.type === "thinking" && typeof parsed.message === "string") {
        return [{ kind: "thinking", ts, text: parsed.message }];
      }
      if (parsed.type === "tool_use") {
        return [{ kind: "tool_call", ts, name: parsed.name ?? "unknown", input: parsed.input }];
      }
      if (parsed.type === "tool_result") {
        return [{
          kind: "tool_result",
          ts,
          toolUseId: parsed.tool_use_id ?? "",
          content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content),
          isError: parsed.is_error === true,
        }];
      }
      if (parsed.type === "result") {
        return [{
          kind: "result",
          ts,
          text: parsed.result ?? "",
          inputTokens: parsed.input_tokens ?? 0,
          outputTokens: parsed.output_tokens ?? 0,
          cachedTokens: parsed.cache_read_input_tokens ?? 0,
          costUsd: parsed.total_cost_usd ?? 0,
          subtype: parsed.subtype ?? "",
          isError: parsed.is_error === true,
          errors: [],
        }];
      }
    } catch {
      // Not valid JSON — fall through to raw output
    }
  }

  return [{ kind: "stdout", ts, text: trimmed }];
}
