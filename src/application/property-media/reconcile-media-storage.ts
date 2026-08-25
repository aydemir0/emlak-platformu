import { randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";
import {
  emitWorkerRun,
  EMPTY_WORKER_FAILURE_CATEGORIES,
  type WorkerRunReporter,
} from "@/application/observability/worker-run";
import type { MediaStorage } from "@/application/property-media/media-storage";
import type { MediaWorkerRepository } from "@/application/property-media/media-worker-ports";

const RECONCILABLE_PREFIXES = [
  "private/quarantine/properties/",
  "private/originals/properties/",
  "delivery/properties/",
] as const;

export async function reconcileMediaStorage(
  repository: MediaWorkerRepository,
  storage: MediaStorage,
  input: Readonly<{
    prefix: string;
    cursor?: string;
    limit: number;
    now: Date;
    graceSeconds: number;
    deleteOrphans?: boolean;
    maximumDelete?: number;
    correlationId?: string;
    reportRun?: WorkerRunReporter;
  }>,
): Promise<{
  inspected: number;
  candidates: number;
  deleted: number;
  cursor?: string;
}> {
  const startedAt = Date.now();
  const correlationId = input.correlationId ?? randomUUID();
  if (
    !RECONCILABLE_PREFIXES.includes(
      input.prefix as (typeof RECONCILABLE_PREFIXES)[number],
    ) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > 250 ||
    !Number.isSafeInteger(input.graceSeconds) ||
    input.graceSeconds < 0 ||
    (input.deleteOrphans === true &&
      (!Number.isSafeInteger(input.maximumDelete) ||
        (input.maximumDelete ?? 0) <= 0 ||
        (input.maximumDelete ?? 0) > input.limit))
  ) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }
  let claimed = 0;
  let phase: "database" | "storage" = "storage";
  try {
    const page = await storage.list(input.prefix, input.cursor, input.limit);
    claimed = page.objects.length;
    const cutoff = input.now.getTime() - input.graceSeconds * 1000;
    const orphanKeys: string[] = [];
    phase = "database";
    const authoritativeKeys = await repository.findAuthoritativeObjectKeys(
      page.objects.map((object) => object.key),
    );
    for (const object of page.objects) {
      if (
        object.uploadedAt.getTime() <= cutoff &&
        !authoritativeKeys.has(object.key)
      ) {
        orphanKeys.push(object.key);
      }
    }
    phase = "storage";
    if (
      input.deleteOrphans === true &&
      orphanKeys.length > (input.maximumDelete ?? 0)
    ) {
      throw new ApplicationError(
        "MEDIA_VALIDATION_FAILED",
        "MEDIA_RECONCILIATION_DELETE_LIMIT",
      );
    }
    const deleted = input.deleteOrphans === true ? orphanKeys.length : 0;
    if (deleted > 0) await storage.delete(orphanKeys);
    emitWorkerRun(input.reportRun, {
      operation: "media.reconcile",
      correlationId,
      claimed,
      succeeded: page.objects.length,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      durationMs: Math.max(0, Date.now() - startedAt),
      failureCategories: EMPTY_WORKER_FAILURE_CATEGORIES,
    });
    return {
      inspected: page.objects.length,
      candidates: orphanKeys.length,
      deleted,
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  } catch (error) {
    emitWorkerRun(input.reportRun, {
      operation: "media.reconcile",
      correlationId,
      claimed,
      succeeded: 0,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      durationMs: Math.max(0, Date.now() - startedAt),
      failureCategories: {
        ...EMPTY_WORKER_FAILURE_CATEGORIES,
        dependency: phase === "database" ? 1 : 0,
        storage: phase === "storage" ? 1 : 0,
      },
    });
    throw error;
  }
}
