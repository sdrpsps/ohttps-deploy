import { redactSensitive } from "../domain/ohttps-client";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured console logger with a single redaction boundary for secrets/PEM. */
export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => write("debug", scope, message, meta),
    info: (message: string, meta?: unknown) => write("info", scope, message, meta),
    warn: (message: string, meta?: unknown) => write("warn", scope, message, meta),
    error: (message: string, meta?: unknown) => write("error", scope, message, meta),
  };
}

function write(level: LogLevel, scope: string, message: string, meta?: unknown) {
  const safeMessage = redactSensitive(message);
  const payload = meta === undefined ? undefined : redactSensitive(JSON.stringify(meta));
  const line = JSON.stringify({ time: new Date().toISOString(), level, scope, message: safeMessage, ...(payload ? { meta: JSON.parse(payload) } : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

