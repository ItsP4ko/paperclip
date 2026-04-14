import type { UIAdapterModule } from "../types";
import { parseE2BSandboxStdoutLine } from "@paperclipai/adapter-e2b-sandbox/ui";
import { buildE2BSandboxAdapterConfig } from "@paperclipai/adapter-e2b-sandbox/ui";
import { ProcessConfigFields } from "../process/config-fields";

export const e2bSandboxUIAdapter: UIAdapterModule = {
  type: "e2b_sandbox",
  label: "E2B Sandbox (cloud)",
  parseStdoutLine: parseE2BSandboxStdoutLine,
  ConfigFields: ProcessConfigFields,
  buildAdapterConfig: buildE2BSandboxAdapterConfig,
};
