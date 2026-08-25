import type { AppEnvironment } from "@/config/env.server";
import { isSafeCorrelationId } from "@/lib/request-context";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogData = Readonly<Record<string, unknown>>;
export type LogRecord = Readonly<{
  timestamp: string;
  level: LogLevel;
  event: string;
  correlationId?: string;
  appEnv: AppEnvironment;
  appRelease: string;
  operation?: string;
  errorCode?: string;
  data: LogData;
}>;

export interface StructuredLogger {
  debug(event: string, data?: LogData): void;
  info(event: string, data?: LogData): void;
  warn(event: string, data?: LogData): void;
  error(event: string, data?: LogData): void;
}

export type StructuredLoggerOptions = Readonly<{
  appEnv: AppEnvironment;
  appRelease: string;
  sink: (record: LogRecord) => void;
}>;

const sensitiveKey =
  /authorization|cookie|password|secret|token|service.?role|api.?key|database|connection|string|credential|r2|email|e-mail|phone|telephone|mobile|message|comment|description|payload|body|provider|response|request|headers|raw|sql|query|address|name|note|summary|content|text/i;
const safeOperation = /^[a-z][a-z0-9._-]{0,127}$/;
const safeErrorCode = /^[A-Z][A-Z0-9_]{0,127}$/;
const safeOperationalValues = {
  category: new Set([
    "application",
    "authorization",
    "dependency",
    "storage",
    "validation",
  ]),
  kind: new Set(["command", "dependency", "request", "worker"]),
  outcome: new Set([
    "failed",
    "failure",
    "ok",
    "rejected",
    "skipped",
    "success",
  ]),
  phase: new Set(["completed", "failed", "started"]),
  status: new Set(["degraded", "failed", "ok", "ready", "unavailable"]),
} as const;

function isSafeOperationalValue(key: string, value: string): boolean {
  return (
    key in safeOperationalValues &&
    safeOperationalValues[key as keyof typeof safeOperationalValues].has(value)
  );
}

function redact(
  value: unknown,
  seen = new WeakSet<object>(),
  key?: string,
): unknown {
  if (typeof value === "string") {
    return key && isSafeOperationalValue(key, value) ? value : "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[REDACTED]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(nested, seen, key),
      ]),
    );
  }
  return value;
}

export function createStructuredLogger(
  options: StructuredLoggerOptions,
): StructuredLogger {
  const write = (level: LogLevel, event: string, data: LogData = {}) => {
    const { correlationId, operation, errorCode, ...context } = data;
    options.sink({
      timestamp: new Date().toISOString(),
      level,
      event,
      appEnv: options.appEnv,
      appRelease: options.appRelease,
      ...(isSafeCorrelationId(correlationId) ? { correlationId } : {}),
      ...(typeof operation === "string" && safeOperation.test(operation)
        ? { operation }
        : {}),
      ...(typeof errorCode === "string" && safeErrorCode.test(errorCode)
        ? { errorCode }
        : {}),
      data: redact(context) as LogData,
    });
  };
  return {
    debug: (event, data) => write("debug", event, data),
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
  };
}
