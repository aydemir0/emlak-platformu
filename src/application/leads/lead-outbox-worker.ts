import {
  dispatchLeadOutboxMessage,
  LeadOutboxPiiError,
  type LeadOutboxConsumers,
} from "@/application/leads/lead-outbox";
import {
  assertWorkerExecutionPolicy,
  emitWorkerRun,
  EMPTY_WORKER_FAILURE_CATEGORIES,
  type WorkerRunReporter,
  type WorkerRunSummary,
} from "@/application/observability/worker-run";

export type ClaimedLeadOutboxMessage = Readonly<{
  id: string;
  eventName: "lead.notification_requested" | "lead.analytics_requested";
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
  attemptCount: number;
  recoveredStaleLease: boolean;
}>;

export type LeadOutboxFailure = Readonly<{
  code: string;
  retryable: boolean;
}>;

export interface LeadOutboxWorkerRepository {
  claim(
    workerId: string,
    limit: number,
    leaseMs: number,
  ): Promise<ClaimedLeadOutboxMessage[]>;
  markProcessed(messageId: string, workerId: string): Promise<void>;
  markFailed(
    messageId: string,
    workerId: string,
    failure: LeadOutboxFailure,
    retryDelayMs: number,
  ): Promise<void>;
}

export class LeadOutboxDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

function failureFrom(error: unknown): LeadOutboxFailure {
  if (error instanceof LeadOutboxPiiError)
    return { code: "LEAD_OUTBOX_PII", retryable: false };
  if (error instanceof LeadOutboxDeliveryError)
    return { code: error.code, retryable: error.retryable };
  return { code: "LEAD_OUTBOX_DELIVERY_FAILED", retryable: true };
}

export async function processLeadOutboxBatch(
  repository: LeadOutboxWorkerRepository,
  consumers: LeadOutboxConsumers,
  options: Readonly<{
    workerId: string;
    limit: number;
    leaseMs: number;
    retryDelayMs: number;
    maxAttempts: number;
    correlationId: string;
    reportRun?: WorkerRunReporter;
  }>,
): Promise<WorkerRunSummary> {
  assertWorkerExecutionPolicy(options);
  const startedAt = Date.now();
  let messages: ClaimedLeadOutboxMessage[] = [];
  let succeeded = 0;
  let retried = 0;
  let deadLettered = 0;
  let dependencyFailures = 0;
  let validationFailures = 0;
  const report = () =>
    emitWorkerRun(options.reportRun, {
      operation: "lead.outbox",
      correlationId: options.correlationId,
      claimed: messages.length,
      succeeded,
      retried,
      deadLettered,
      staleRecovered: messages.filter((message) => message.recoveredStaleLease)
        .length,
      durationMs: Math.max(0, Date.now() - startedAt),
      failureCategories: {
        ...EMPTY_WORKER_FAILURE_CATEGORIES,
        dependency: dependencyFailures,
        validation: validationFailures,
      },
    });
  try {
    messages = await repository.claim(
      options.workerId,
      options.limit,
      options.leaseMs,
    );
    for (const message of messages) {
      if (message.attemptCount > options.maxAttempts) {
        await repository.markFailed(
          message.id,
          options.workerId,
          { code: "LEAD_OUTBOX_MAX_ATTEMPTS_EXCEEDED", retryable: false },
          options.retryDelayMs,
        );
        deadLettered += 1;
        dependencyFailures += 1;
        continue;
      }
      let originalFailure: LeadOutboxFailure | undefined;
      try {
        await dispatchLeadOutboxMessage(message, consumers);
      } catch (error) {
        originalFailure = failureFrom(error);
      }
      if (!originalFailure) {
        await repository.markProcessed(message.id, options.workerId);
        succeeded += 1;
        continue;
      }
      const exhausted =
        originalFailure.retryable &&
        message.attemptCount >= options.maxAttempts;
      const failure = exhausted
        ? {
            code: "LEAD_OUTBOX_MAX_ATTEMPTS_EXCEEDED",
            retryable: false,
          }
        : originalFailure;
      await repository.markFailed(
        message.id,
        options.workerId,
        failure,
        options.retryDelayMs,
      );
      if (failure.retryable) retried += 1;
      else deadLettered += 1;
      if (originalFailure.retryable) dependencyFailures += 1;
      else validationFailures += 1;
    }
    return report();
  } catch (error) {
    dependencyFailures += 1;
    report();
    throw error;
  }
}
