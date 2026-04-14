import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printE2BSandboxStreamEvent } from "./format-event.js";

export const e2bSandboxCLIAdapter: CLIAdapterModule = {
  type: "e2b_sandbox",
  formatStdoutEvent: printE2BSandboxStreamEvent,
};

export { printE2BSandboxStreamEvent };
