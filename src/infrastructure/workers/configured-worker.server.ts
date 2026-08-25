import "server-only";

import { executeScheduledWorker } from "@/application/workers/scheduler-invocation";
import { processNextMedia } from "@/application/property-media/process-next-media";
import type { WorkerRunSummary } from "@/application/observability/worker-run";
import { getRuntimeIdentity } from "@/config/env.server.runtime";
import { reportWorkerRun } from "@/infrastructure/observability/runtime-observability.server";
import { getMediaStorage } from "@/infrastructure/property-media/media-storage-factory.server";
import { PostgresMediaWorkerRepository } from "@/infrastructure/property-media/postgres-media-unit-of-work.server";
import { SharpImageProcessor } from "@/infrastructure/property-media/sharp-image-processor.server";

export const SCHEDULED_WORKERS = [
  "lead-outbox",
  "appointment-reminders",
  "media-processing",
  "media-reconciliation",
  "maintenance",
] as const;

export type ScheduledWorkerName = (typeof SCHEDULED_WORKERS)[number];

export class ConfiguredWorkerUnavailableError extends Error {
  constructor(readonly worker: ScheduledWorkerName) {
    super("WORKER_DEPENDENCY_UNAVAILABLE");
  }
}

export function isScheduledWorkerName(
  value: string,
): value is ScheduledWorkerName {
  return SCHEDULED_WORKERS.includes(value as ScheduledWorkerName);
}

export async function runConfiguredWorker(
  worker: ScheduledWorkerName,
  runId: string,
) {
  if (worker !== "media-processing") {
    throw new ConfiguredWorkerUnavailableError(worker);
  }

  return executeScheduledWorker({
    operation: "media.process",
    runId,
    async run() {
      let summary: WorkerRunSummary | undefined;
      await processNextMedia(
        new PostgresMediaWorkerRepository(),
        getMediaStorage(),
        new SharpImageProcessor(),
        {
          workerId: `media-${runId}`,
          processorVersion: `release-${getRuntimeIdentity().APP_RELEASE}`,
          correlationId: () => runId,
          maxAttempts: 3,
          reportRun(value) {
            summary = value;
            reportWorkerRun(value);
          },
        },
      );
      if (!summary) throw new Error("WORKER_SUMMARY_MISSING");
      return {
        claimed: summary.claimed,
        succeeded: summary.succeeded,
        retried: summary.retried,
        deadLettered: summary.deadLettered,
      };
    },
  });
}
