import type { PaperclipConfig } from "@paperclipai/shared";

// In the Next.js app there is no config file — all configuration is via env vars.
export function readConfigFile(): PaperclipConfig | null {
  return null;
}
