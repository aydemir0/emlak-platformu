export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogData = Readonly<Record<string, unknown>>;
export type LogRecord = Readonly<{
  timestamp: string;
  level: LogLevel;
  event: string;
  data: LogData;
}>;

export interface StructuredLogger {
  debug(event: string, data?: LogData): void;
  info(event: string, data?: LogData): void;
  warn(event: string, data?: LogData): void;
  error(event: string, data?: LogData): void;
}

const sensitiveKey =
  /authorization|cookie|password|secret|token|service.?role|api.?key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(nested),
      ]),
    );
  }
  return value;
}

export function createStructuredLogger(
  sink: (record: LogRecord) => void,
): StructuredLogger {
  const write = (level: LogLevel, event: string, data: LogData = {}) =>
    sink({
      timestamp: new Date().toISOString(),
      level,
      event,
      data: redact(data) as LogData,
    });
  return {
    debug: (event, data) => write("debug", event, data),
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
  };
}
