import type { TelemetryClient } from "@paperclipai/shared/telemetry";

// Telemetry is disabled in the serverless Next.js app.
export function initTelemetry(_fileConfig?: { enabled?: boolean }): TelemetryClient | null {
  return null;
}

export function getTelemetryClient(): TelemetryClient | null {
  return null;
}
