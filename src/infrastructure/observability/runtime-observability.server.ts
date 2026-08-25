import "server-only";

import {
  createStructuredLogger,
  type LogRecord,
} from "@/application/observability/logger";
import {
  createTelemetry,
  type Telemetry,
} from "@/application/observability/telemetry";
import type { WorkerRunSummary } from "@/application/observability/worker-run";
import { toErrorDiagnostic } from "@/application/errors/application-error";
import type { AppEnvironment } from "@/config/env.server";
import { getRuntimeIdentity } from "@/config/env.server.runtime";

type UnexpectedErrorContext = Readonly<{
  correlationId?: string;
  operation: string;
}>;

type RuntimeObservabilityOptions = Readonly<{
  sink?: (record: LogRecord) => void;
}>;

export interface RuntimeObservability {
  reportUnexpectedError(error: unknown, context: UnexpectedErrorContext): void;
  reportWorkerRun(summary: WorkerRunSummary): void;
}

function writeRuntimeRecord(record: LogRecord): void {
  console.error(JSON.stringify(record));
}

function createRuntimeTelemetry(
  appEnv: AppEnvironment,
  appRelease: string,
): Telemetry {
  return createTelemetry({
    appEnv,
    appRelease,
  });
}

export function createRuntimeObservability(
  options: RuntimeObservabilityOptions = {},
): RuntimeObservability {
  const env = getRuntimeIdentity();
  const logger = createStructuredLogger({
    appEnv: env.APP_ENV,
    appRelease: env.APP_RELEASE,
    sink: options.sink ?? writeRuntimeRecord,
  });
  const telemetry = createRuntimeTelemetry(env.APP_ENV, env.APP_RELEASE);

  return {
    reportUnexpectedError(error, context) {
      const diagnostic = toErrorDiagnostic(error, context);
      try {
        logger.error("operation.failed", {
          correlationId: diagnostic.correlationId,
          operation: diagnostic.operation,
          errorCode: diagnostic.code,
        });
      } catch {
        // Reporting is best effort and must not replace the safe application outcome.
      }
      try {
        telemetry.captureException(error, context);
      } catch {
        // Keep telemetry adapters outside authoritative request outcomes.
      }
    },
    reportWorkerRun(summary) {
      const hasFailures = Object.values(summary.failureCategories).some(
        (count) => count > 0,
      );
      logger.info("worker.run.completed", {
        correlationId: summary.correlationId,
        operation: summary.operation,
        kind: "worker",
        phase: "completed",
        outcome:
          hasFailures || summary.retried > 0 || summary.deadLettered > 0
            ? "failed"
            : "success",
        claimed: summary.claimed,
        succeeded: summary.succeeded,
        retried: summary.retried,
        deadLettered: summary.deadLettered,
        staleRecovered: summary.staleRecovered,
        durationMs: summary.durationMs,
        failureCategories: summary.failureCategories,
      });
    },
  };
}

export function reportUnexpectedError(
  error: unknown,
  context: UnexpectedErrorContext,
): void {
  try {
    createRuntimeObservability().reportUnexpectedError(error, context);
  } catch {
    // Runtime identity or reporter construction must not break safe fallbacks.
  }
}

export function reportWorkerRun(summary: WorkerRunSummary): void {
  createRuntimeObservability().reportWorkerRun(summary);
}
