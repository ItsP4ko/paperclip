import { useEffect, useMemo, useRef, useState } from "react";
import { getWsHost } from "@/ui/lib/api-base";
import { useQuery } from "@tanstack/react-query";
import type { LiveEvent } from "@paperclipai/shared";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { heartbeatsApi, type LiveRunForIssue } from "../../api/heartbeats";
import { buildTranscript, getUIAdapter, type RunLogChunk, type TranscriptEntry } from "../../adapters";
import { queryKeys } from "../../lib/queryKeys";

const LOG_POLL_INTERVAL_MS = 2000;
const LOG_READ_LIMIT_BYTES = 256_000;

interface UseLiveRunTranscriptsOptions {
  runs: LiveRunForIssue[];
  companyId?: string | null;
  maxChunksPerRun?: number;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isTerminalStatus(status: string): boolean {
  return status === "failed" || status === "timed_out" || status === "cancelled" || status === "succeeded";
}

function parsePersistedLogContent(
  runId: string,
  content: string,
  pendingByRun: Map<string, string>,
): Array<RunLogChunk & { dedupeKey: string }> {
  if (!content) return [];

  const pendingKey = `${runId}:records`;
  const combined = `${pendingByRun.get(pendingKey) ?? ""}${content}`;
  const split = combined.split("\n");
  pendingByRun.set(pendingKey, split.pop() ?? "");

  const parsed: Array<RunLogChunk & { dedupeKey: string }> = [];
  for (const line of split) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as { ts?: unknown; stream?: unknown; chunk?: unknown };
      const stream = raw.stream === "stderr" || raw.stream === "system" ? raw.stream : "stdout";
      const chunk = typeof raw.chunk === "string" ? raw.chunk : "";
      const ts = typeof raw.ts === "string" ? raw.ts : new Date().toISOString();
      if (!chunk) continue;
      parsed.push({
        ts,
        stream,
        chunk,
        dedupeKey: `log:${runId}:${ts}:${stream}:${chunk}`,
      });
    } catch {
      // Ignore malformed log rows.
    }
  }

  return parsed;
}

export function useLiveRunTranscripts({
  runs,
  companyId,
  maxChunksPerRun = 200,
}: UseLiveRunTranscriptsOptions) {
  const [chunksByRun, setChunksByRun] = useState<Map<string, RunLogChunk[]>>(new Map());
  const seenChunkKeysRef = useRef(new Set<string>());
  const pendingLogRowsByRunRef = useRef(new Map<string, string>());
  const logOffsetByRunRef = useRef(new Map<string, number>());
  // Tracks runs where we already loaded from events fallback (to avoid redundant re-fetches)
  const eventSeqByRunRef = useRef(new Map<string, number>());
  const { data: generalSettings } = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const activeRunIds = useMemo(
    () => new Set(runs.filter((run) => {
      // Keep tracking runs that aren't terminal OR have an active/idle session
      if (!isTerminalStatus(run.status)) return true;
      const sr = run as { sessionStatus?: string | null };
      return sr.sessionStatus === "idle" || sr.sessionStatus === "active";
    }).map((run) => run.id)),
    [runs],
  );
  const runIdsKey = useMemo(
    () => runs.map((run) => run.id).sort((a, b) => a.localeCompare(b)).join(","),
    [runs],
  );

  const appendChunks = (runId: string, chunks: Array<RunLogChunk & { dedupeKey: string }>) => {
    if (chunks.length === 0) return;
    setChunksByRun((prev) => {
      const next = new Map(prev);
      const existing = [...(next.get(runId) ?? [])];
      let changed = false;

      for (const chunk of chunks) {
        if (seenChunkKeysRef.current.has(chunk.dedupeKey)) continue;
        seenChunkKeysRef.current.add(chunk.dedupeKey);
        existing.push({ ts: chunk.ts, stream: chunk.stream, chunk: chunk.chunk });
        changed = true;
      }

      if (!changed) return prev;
      if (seenChunkKeysRef.current.size > 12000) {
        seenChunkKeysRef.current.clear();
      }
      next.set(runId, existing.slice(-maxChunksPerRun));
      return next;
    });
  };

  useEffect(() => {
    const knownRunIds = new Set(runs.map((run) => run.id));
    setChunksByRun((prev) => {
      const next = new Map<string, RunLogChunk[]>();
      for (const [runId, chunks] of prev) {
        if (knownRunIds.has(runId)) {
          next.set(runId, chunks);
        }
      }
      return next.size === prev.size ? prev : next;
    });

    for (const key of pendingLogRowsByRunRef.current.keys()) {
      const runId = key.replace(/:records$/, "");
      if (!knownRunIds.has(runId)) {
        pendingLogRowsByRunRef.current.delete(key);
      }
    }
    for (const runId of logOffsetByRunRef.current.keys()) {
      if (!knownRunIds.has(runId)) {
        logOffsetByRunRef.current.delete(runId);
      }
    }
    for (const runId of eventSeqByRunRef.current.keys()) {
      if (!knownRunIds.has(runId)) {
        eventSeqByRunRef.current.delete(runId);
      }
    }
  }, [runs]);

  useEffect(() => {
    if (runs.length === 0) return;

    let cancelled = false;

    const readRunLog = async (run: LiveRunForIssue) => {
      const offset = logOffsetByRunRef.current.get(run.id) ?? 0;

      // Try persisted log file first (server-executed runs).
      // Wrapped in its own try-catch so a 404 (local-runner runs have no
      // logStore/logRef) doesn't prevent the events fallback from running.
      try {
        const result = await heartbeatsApi.log(run.id, offset, LOG_READ_LIMIT_BYTES);
        if (cancelled) return;

        const logChunks = parsePersistedLogContent(run.id, result.content, pendingLogRowsByRunRef.current);
        if (logChunks.length > 0) {
          appendChunks(run.id, logChunks);
          if (result.nextOffset !== undefined) {
            logOffsetByRunRef.current.set(run.id, result.nextOffset);
          } else if (result.content.length > 0) {
            logOffsetByRunRef.current.set(run.id, offset + result.content.length);
          }
          return; // log data is available — no need for events fallback
        }
      } catch {
        // Log file not available (e.g. local-runner runs) — fall through to events.
      }

      // Fall back to events API so the transcript viewer can show parsed
      // output even when no log file was persisted (local-runner runs).
      try {
        if (cancelled) return;
        const afterSeq = eventSeqByRunRef.current.get(run.id) ?? 0;
        const events = await heartbeatsApi.events(run.id, afterSeq, 500);
        if (cancelled || events.length === 0) return;
        const maxSeq = Math.max(...events.map((e) => e.seq));
        eventSeqByRunRef.current.set(run.id, maxSeq);
        const eventChunks = events
          .filter((e) => e.stream === "stdout" || e.stream === "stderr" || e.stream === "system")
          .map((e) => ({
            ts: new Date(e.createdAt).toISOString(),
            stream: (e.stream ?? "stdout") as "stdout" | "stderr" | "system",
            chunk: e.message ?? (e.payload ? JSON.stringify(e.payload) : ""),
            dedupeKey: `event:${run.id}:${e.id}`,
          }))
          .filter((c) => c.chunk.trim().length > 0);
        appendChunks(run.id, eventChunks);
      } catch {
        // Ignore event read errors while output is initializing.
      }
    };

    const readAll = async () => {
      await Promise.all(runs.map((run) => readRunLog(run)));
    };

    void readAll();
    const interval = window.setInterval(() => {
      void readAll();
    }, LOG_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runIdsKey, runs]);

  useEffect(() => {
    if (!companyId || activeRunIds.size === 0) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${getWsHost()}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (message) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;

        let event: LiveEvent;
        try {
          event = JSON.parse(raw) as LiveEvent;
        } catch {
          return;
        }

        if (event.companyId !== companyId) return;
        const payload = event.payload ?? {};
        const runId = readString(payload["runId"]);
        if (!runId || !activeRunIds.has(runId)) return;
        if (!runById.has(runId)) return;

        if (event.type === "heartbeat.run.log") {
          const chunk = readString(payload["chunk"]);
          if (!chunk) return;
          const ts = readString(payload["ts"]) ?? event.createdAt;
          const stream =
            readString(payload["stream"]) === "stderr"
              ? "stderr"
              : readString(payload["stream"]) === "system"
                ? "system"
                : "stdout";
          appendChunks(runId, [{
            ts,
            stream,
            chunk,
            dedupeKey: `log:${runId}:${ts}:${stream}:${chunk}`,
          }]);
          return;
        }

        if (event.type === "heartbeat.run.event") {
          const seq = typeof payload["seq"] === "number" ? payload["seq"] : null;
          const eventType = readString(payload["eventType"]) ?? "event";
          const payloadStream = readString(payload["stream"]);
          const messageText = readString(payload["message"]) ?? eventType;
          // For log events from local runners, use the actual stream from
          // the payload (stdout/stderr) instead of defaulting to "system".
          const stream: "stdout" | "stderr" | "system" =
            eventType === "log" && (payloadStream === "stdout" || payloadStream === "stderr")
              ? payloadStream
              : eventType === "error"
                ? "stderr"
                : "system";
          appendChunks(runId, [{
            ts: event.createdAt,
            stream,
            chunk: messageText,
            dedupeKey: `socket:event:${runId}:${seq ?? `${eventType}:${messageText}:${event.createdAt}`}`,
          }]);
          return;
        }

        if (event.type === "heartbeat.run.message") {
          const message = readString(payload["message"]);
          const role = readString(payload["role"]);
          if (message && role === "human") {
            appendChunks(runId, [{
              ts: event.createdAt,
              stream: "system",
              chunk: `[user] ${message}`,
              dedupeKey: `socket:message:${runId}:${readString(payload["turnSeq"]) ?? event.createdAt}`,
            }]);
          }
          return;
        }

        if (event.type === "heartbeat.run.status") {
          const status = readString(payload["status"]) ?? "updated";
          appendChunks(runId, [{
            ts: event.createdAt,
            stream: isTerminalStatus(status) && status !== "succeeded" ? "stderr" : "system",
            chunk: `run ${status}`,
            dedupeKey: `socket:status:${runId}:${status}:${readString(payload["finishedAt"]) ?? ""}`,
          }]);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "live_run_transcripts_unmount");
      }
    };
  }, [activeRunIds, companyId, runById]);

  const transcriptByRun = useMemo(() => {
    const next = new Map<string, TranscriptEntry[]>();
    const censorUsernameInLogs = generalSettings?.censorUsernameInLogs === true;
    for (const run of runs) {
      const adapter = getUIAdapter(run.adapterType);
      next.set(
        run.id,
        buildTranscript(chunksByRun.get(run.id) ?? [], adapter.parseStdoutLine, {
          censorUsernameInLogs,
        }),
      );
    }
    return next;
  }, [chunksByRun, generalSettings?.censorUsernameInLogs, runs]);

  return {
    transcriptByRun,
    hasOutputForRun(runId: string) {
      return (chunksByRun.get(runId)?.length ?? 0) > 0;
    },
  };
}
