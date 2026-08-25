export type WorkerOperation =
  "appointment.reminder" | "lead.outbox" | "media.process" | "media.reconcile";

export type WorkerFailureCategories = Readonly<{
  application: number;
  dependency: number;
  storage: number;
  validation: number;
}>;

export type WorkerRunSummary = Readonly<{
  operation: WorkerOperation;
  correlationId: string;
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  staleRecovered: number;
  durationMs: number;
  failureCategories: WorkerFailureCategories;
}>;

export type WorkerRunReporter = (summary: WorkerRunSummary) => void;

export class WorkerLeaseLostError extends Error {
  constructor(
    readonly operation: WorkerOperation,
    readonly workId: string,
  ) {
    super("WORKER_LEASE_LOST");
    this.name = "WorkerLeaseLostError";
  }
}

export const EMPTY_WORKER_FAILURE_CATEGORIES: WorkerFailureCategories = {
  application: 0,
  dependency: 0,
  storage: 0,
  validation: 0,
};

const MAX_WORKER_ATTEMPTS = 100;
const MAX_WORKER_RETRY_DELAY_MS = 3_600_000;
const MAX_WORKER_BATCH_SIZE = 100;
const MAX_WORKER_LEASE_MS = 900_000;
const MIN_WORKER_LEASE_MS = 1_000;

export function assertWorkerRetryPolicy(
  maxAttempts: number,
  retryDelayMs?: number,
): void {
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts <= 0 ||
    maxAttempts > MAX_WORKER_ATTEMPTS ||
    (retryDelayMs !== undefined &&
      (!Number.isSafeInteger(retryDelayMs) ||
        retryDelayMs <= 0 ||
        retryDelayMs > MAX_WORKER_RETRY_DELAY_MS))
  ) {
    throw new Error("WORKER_RETRY_POLICY_INVALID");
  }
}

export function assertWorkerExecutionPolicy(input: {
  limit: number;
  leaseMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}): void {
  assertWorkerRetryPolicy(input.maxAttempts, input.retryDelayMs);
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > MAX_WORKER_BATCH_SIZE ||
    !Number.isSafeInteger(input.leaseMs) ||
    input.leaseMs < MIN_WORKER_LEASE_MS ||
    input.leaseMs > MAX_WORKER_LEASE_MS
  ) {
    throw new Error("WORKER_EXECUTION_POLICY_INVALID");
  }
}

export function emitWorkerRun(
  reporter: WorkerRunReporter | undefined,
  summary: WorkerRunSummary,
): WorkerRunSummary {
  try {
    reporter?.(summary);
  } catch {
    // Observability must not alter authoritative worker outcomes.
  }
  return summary;
}
