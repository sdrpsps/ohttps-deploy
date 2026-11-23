import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_CONTROL_SECRET = "development-only-change-me-32chars";
const DEFAULT_TIMEOUT_MS = 300;
const MAX_BODY_BYTES = 16 * 1024;
const DISABLED_VALUES = new Set(["none", "disabled", "false", "0"]);

export type WorkerSignalPayload =
  | { action: "wake"; reason?: string }
  | { action: "cancel"; deploymentId: string };

export interface WorkerControlHandlers {
  onWake: (reason?: string) => void;
  onCancel: (deploymentId: string) => boolean | void;
}

export interface WorkerControlServer {
  socketPath: string | null;
  close: () => Promise<void>;
}

interface RegisteredInProcessHandler extends WorkerControlHandlers {
  socketPath: string | null;
  secret: string;
  requireAuth: boolean;
}

type TransportResult = { status: "http"; ok: boolean } | { status: "transport_error" };

let inProcessHandler: RegisteredInProcessHandler | undefined;

function getControlSecret(override?: string): string {
  const secret = override?.trim() || process.env.AUTH_SECRET?.trim();
  return secret || DEFAULT_CONTROL_SECRET;
}

function hasConfiguredSecret(override?: string): boolean {
  return Boolean(override?.trim() || process.env.AUTH_SECRET?.trim());
}

function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function verifyToken(body: string, tokenHeader: string | string[] | undefined, secret: string): boolean {
  const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  if (!token) return false;
  const expected = signPayload(body, secret);
  const actualBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Resolve the shared Unix Domain Socket path for Web -> Worker signaling.
 * Returns null when explicitly disabled or when DATABASE_URL is in-memory / remote.
 */
export function resolveWorkerSocketPath(
  source: Record<string, string | undefined> = process.env
): string | null {
  const explicit = source.WORKER_CONTROL_SOCKET?.trim();
  if (explicit) {
    if (DISABLED_VALUES.has(explicit.toLowerCase())) return null;
    return explicit;
  }

  const rawDatabaseUrl = source.DATABASE_URL?.trim() || "./data/ohttps-deploy.db";
  const dbPath = rawDatabaseUrl.startsWith("file:") ? rawDatabaseUrl.slice(5) : rawDatabaseUrl;
  if (
    !dbPath ||
    dbPath === ":memory:" ||
    /^https?:\/\//i.test(dbPath) ||
    /^libsql:\/\//i.test(dbPath)
  ) {
    return null;
  }

  const candidate = join(dirname(dbPath), "worker-control.sock");
  if (Buffer.byteLength(candidate, "utf8") >= 100) {
    const hash = createHash("sha256").update(candidate).digest("hex").slice(0, 12);
    return join(tmpdir(), `ohttps-w-${hash}.sock`);
  }
  return candidate;
}

function dispatchInProcess(
  payload: WorkerSignalPayload,
  rawBody: string,
  tokenHeader: string | string[] | undefined,
  handler: RegisteredInProcessHandler
): boolean {
  if (handler.requireAuth || tokenHeader !== undefined) {
    if (!verifyToken(rawBody, tokenHeader, handler.secret)) {
      return false;
    }
  }
  try {
    if (payload.action === "wake") {
      handler.onWake(payload.reason);
      return true;
    }
    handler.onCancel(payload.deploymentId);
    return true;
  } catch {
    return false;
  }
}

export async function startWorkerControlServer(
  handlers: WorkerControlHandlers,
  options?: { socketPath?: string | null; authSecret?: string }
): Promise<WorkerControlServer> {
  const socketPath = options?.socketPath !== undefined ? options.socketPath : resolveWorkerSocketPath();
  const requireAuth = hasConfiguredSecret(options?.authSecret);
  const secret = getControlSecret(options?.authSecret);
  const registration: RegisteredInProcessHandler = {
    ...handlers,
    socketPath,
    secret,
    requireAuth,
  };
  inProcessHandler = registration;

  if (!socketPath) {
    return {
      socketPath: null,
      close: async () => {
        if (inProcessHandler === registration) {
          inProcessHandler = undefined;
        }
      },
    };
  }

  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  rmSync(socketPath, { force: true });

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/control") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;

    req.on("data", (chunk: Buffer) => {
      if (rejected) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        rejected = true;
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (rejected) return;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const tokenHeader = req.headers["x-worker-token"];
      if (requireAuth || tokenHeader !== undefined) {
        if (!verifyToken(rawBody, tokenHeader, secret)) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
          return;
        }
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const payload = parsed as Record<string, unknown>;
      if (payload.action === "wake") {
        const reason = typeof payload.reason === "string" ? payload.reason : undefined;
        handlers.onWake(reason);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (payload.action === "cancel" && typeof payload.deploymentId === "string" && payload.deploymentId.length > 0) {
        const cancelled = Boolean(handlers.onCancel(payload.deploymentId));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, cancelled }));
        return;
      }

      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });

  try {
    chmodSync(socketPath, 0o600);
  } catch {
    // Best-effort permission hardening across platforms.
  }
  server.unref();

  return {
    socketPath,
    close: async () => {
      if (inProcessHandler === registration) {
        inProcessHandler = undefined;
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      try {
        rmSync(socketPath, { force: true });
      } catch {
        // Ignore cleanup errors during shutdown.
      }
    },
  };
}

function postOverControlTransport(
  requestOptions: http.RequestOptions,
  body: string,
  timeoutMs: number
): Promise<TransportResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TransportResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const req = http.request(requestOptions, (res) => {
        res.resume();
        res.once("end", () =>
          finish({
            status: "http",
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          })
        );
        res.once("error", () => finish({ status: "transport_error" }));
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("worker signal timeout"));
        finish({ status: "transport_error" });
      });
      req.once("error", () => finish({ status: "transport_error" }));
      req.end(body);
    } catch {
      finish({ status: "transport_error" });
    }
  });
}

export async function sendWorkerSignal(
  payload: WorkerSignalPayload,
  options?: {
    socketPath?: string | null;
    controlUrl?: string;
    authSecret?: string;
    timeoutMs?: number;
  }
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify(payload);
  const secret = getControlSecret(options?.authSecret);
  const token = signPayload(body, secret);
  const headers: http.OutgoingHttpHeaders = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "x-worker-token": token,
  };

  const controlUrl = options?.controlUrl?.trim() || process.env.WORKER_CONTROL_URL?.trim();
  if (controlUrl) {
    try {
      const target = new URL("/control", controlUrl.endsWith("/") ? controlUrl : `${controlUrl}/`);
      if (target.protocol !== "http:") return false;
      const result = await postOverControlTransport(
        {
          hostname: target.hostname,
          port: target.port ? Number(target.port) : 80,
          path: target.pathname,
          method: "POST",
          headers,
        },
        body,
        timeoutMs
      );
      return result.status === "http" && result.ok;
    } catch {
      return false;
    }
  }

  const socketPath = options?.socketPath !== undefined ? options.socketPath : resolveWorkerSocketPath();
  if (socketPath) {
    if (!existsSync(socketPath)) {
      if (inProcessHandler && inProcessHandler.socketPath === socketPath) {
        return dispatchInProcess(payload, body, token, inProcessHandler);
      }
      return false;
    }
    const result = await postOverControlTransport(
      {
        socketPath,
        path: "/control",
        method: "POST",
        headers,
      },
      body,
      timeoutMs
    );
    if (result.status === "http") {
      return result.ok;
    }
    if (inProcessHandler && inProcessHandler.socketPath === socketPath) {
      return dispatchInProcess(payload, body, token, inProcessHandler);
    }
    return false;
  }

  if (inProcessHandler && inProcessHandler.socketPath === null) {
    return dispatchInProcess(payload, body, token, inProcessHandler);
  }
  return false;
}

export function notifyWorkerWake(reason?: string): Promise<boolean> {
  return sendWorkerSignal({ action: "wake", ...(reason ? { reason } : {}) }).catch(() => false);
}

export function notifyWorkerCancel(deploymentId: string): Promise<boolean> {
  return sendWorkerSignal({ action: "cancel", deploymentId }).catch(() => false);
}
