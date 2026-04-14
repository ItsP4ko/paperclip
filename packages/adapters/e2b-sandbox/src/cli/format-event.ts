import pc from "picocolors";

export function printE2BSandboxStreamEvent(line: string, debug: boolean): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("[paperclip]")) {
    console.log(pc.dim(trimmed));
    return;
  }

  console.log(trimmed);

  if (debug && trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type) {
        console.log(pc.dim(`  [e2b-debug] event.type=${parsed.type}`));
      }
    } catch {
      // Not JSON, skip
    }
  }
}
