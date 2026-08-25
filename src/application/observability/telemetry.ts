import { toErrorDiagnostic } from "@/application/errors/application-error";
import type { AppEnvironment } from "@/config/env.server";

export type TelemetryEvent = Readonly<{
  event: "error.application" | "error.unexpected";
  appEnv: AppEnvironment;
  appRelease: string;
  correlationId?: string;
  operation?: string;
  errorCode: string;
}>;

export type TelemetryTransport = (event: TelemetryEvent) => void;

export type TelemetryOptions = Readonly<{
  appEnv: AppEnvironment;
  appRelease: string;
  send?: TelemetryTransport;
}>;

export interface Telemetry {
  captureException(
    error: unknown,
    context?: Readonly<{ correlationId?: string; operation?: string }>,
  ): void;
}

export function createTelemetry(options: TelemetryOptions): Telemetry {
  return {
    captureException(error, context = {}) {
      if (options.appEnv !== "production" || !options.send) return;

      const diagnostic = toErrorDiagnostic(error, context);
      try {
        options.send({
          event:
            diagnostic.code === "INTERNAL"
              ? "error.unexpected"
              : "error.application",
          appEnv: options.appEnv,
          appRelease: options.appRelease,
          ...(diagnostic.correlationId
            ? { correlationId: diagnostic.correlationId }
            : {}),
          ...(diagnostic.operation ? { operation: diagnostic.operation } : {}),
          errorCode: diagnostic.code,
        });
      } catch {
        // Telemetry must never alter authoritative request or command outcomes.
      }
    },
  };
}
