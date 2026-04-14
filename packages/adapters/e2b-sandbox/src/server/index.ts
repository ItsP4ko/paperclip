import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sandboxId = readNonEmptyString(record.sandboxId) ?? readNonEmptyString(record.sandbox_id);
    if (!sandboxId) return null;
    return { sandboxId };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sandboxId = readNonEmptyString(params.sandboxId) ?? readNonEmptyString(params.sandbox_id);
    if (!sandboxId) return null;
    return { sandboxId };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return readNonEmptyString(params.sandboxId) ?? readNonEmptyString(params.sandbox_id);
  },
};
