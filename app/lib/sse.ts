const DEFAULT_KEEPALIVE_MS = 15_000;
const POLL_INTERVAL_MS = 300;
const POLL_BACKOFF_STEP_MS = 600;
const POLL_MAX_INTERVAL_MS = 1_000;

export interface StreamLogRow {
  id: string;
  sequence: number;
}

export interface CreateLogStreamOptions<T extends StreamLogRow> {
  request: Request;
  queryLogsAfter: (sequence: number) => Promise<T[]>;
  isTerminal: () => Promise<boolean>;
  endPayload: Record<string, unknown>;
}

function resolveKeepaliveMs(url: URL): number {
  const raw = Number(url.searchParams.get("keepaliveMs"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_KEEPALIVE_MS;
  return Math.max(50, Math.min(60_000, raw));
}

export function createLogEventStreamResponse<T extends StreamLogRow>({
  request,
  queryLogsAfter,
  isTerminal,
  endPayload,
}: CreateLogStreamOptions<T>): Response {
  const url = new URL(request.url);
  const afterParam = Number(url.searchParams.get("after") ?? 0) || 0;
  const lastEventId = Number(request.headers.get("last-event-id") ?? 0) || 0;
  const keepaliveMs = resolveKeepaliveMs(url);
  const encoder = new TextEncoder();

  let closed = false;
  let wakeWait: (() => void) | undefined;

  const stopWait = () => {
    closed = true;
    wakeWait?.();
  };

  const stream = new ReadableStream({
    async start(controller) {
      let sequence = Math.max(0, afterParam, lastEventId);
      let lastSentAt = Date.now();
      let pollDelayMs = POLL_INTERVAL_MS;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
        lastSentAt = Date.now();
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        wakeWait?.();
        try {
          controller.close();
        } catch {
          // Stream already closed by consumer.
        }
      };

      if (request.signal.aborted) {
        safeClose();
        return;
      }

      request.signal.addEventListener("abort", safeClose, { once: true });

      try {
        // Flush an immediate comment frame so reverse proxies commit chunked response headers.
        safeEnqueue(": connected\n\n");

        while (!closed) {
          const rows = await queryLogsAfter(sequence);
          for (const row of rows) {
            if (closed) return;
            sequence = row.sequence;
            safeEnqueue(`id: ${row.sequence}\ndata: ${JSON.stringify(row)}\n\n`);
          }
          pollDelayMs =
            rows.length > 0
              ? POLL_INTERVAL_MS
              : pollDelayMs < POLL_BACKOFF_STEP_MS
                ? POLL_BACKOFF_STEP_MS
                : POLL_MAX_INTERVAL_MS;

          if (await isTerminal()) {
            const remaining = await queryLogsAfter(sequence);
            for (const row of remaining) {
              if (closed) return;
              sequence = row.sequence;
              safeEnqueue(`id: ${row.sequence}\ndata: ${JSON.stringify(row)}\n\n`);
            }
            safeEnqueue(`event: end\ndata: ${JSON.stringify(endPayload)}\n\n`);
            safeClose();
            return;
          }

          if (rows.length === 0 && Date.now() - lastSentAt >= keepaliveMs) {
            safeEnqueue(": keepalive\n\n");
          }

          await new Promise<void>((resolve) => {
            if (closed) {
              resolve();
              return;
            }
            const timer = setTimeout(() => {
              if (wakeWait === onWake) wakeWait = undefined;
              resolve();
            }, Math.min(pollDelayMs, keepaliveMs));
            const onWake = () => {
              clearTimeout(timer);
              if (wakeWait === onWake) wakeWait = undefined;
              resolve();
            };
            wakeWait = onWake;
          });
        }
      } catch {
        if (!closed) {
          closed = true;
          try {
            controller.error(new Error("event stream failed"));
          } catch {
            // Ignore controller error if already closed.
          }
        }
      } finally {
        request.signal.removeEventListener("abort", safeClose);
      }
    },
    cancel() {
      stopWait();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
