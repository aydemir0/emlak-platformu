import {
  dispatchLeadOutboxMessage,
  type LeadOutboxConsumers,
} from "@/application/leads/lead-outbox";

export type ClaimedLeadOutboxMessage = Readonly<{
  id: string;
  eventName: "lead.notification_requested" | "lead.analytics_requested";
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
  attemptCount: number;
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
  }>,
) {
  const messages = await repository.claim(
    options.workerId,
    options.limit,
    options.leaseMs,
  );
  for (const message of messages) {
    try {
      await dispatchLeadOutboxMessage(message, consumers);
      await repository.markProcessed(message.id, options.workerId);
    } catch (error) {
      await repository.markFailed(
        message.id,
        options.workerId,
        failureFrom(error),
        options.retryDelayMs,
      );
    }
  }
  return messages.length;
}
