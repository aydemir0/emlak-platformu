import { describe, expect, it } from "vitest";

import {
  LeadOutboxDeliveryError,
  processLeadOutboxBatch,
  type ClaimedLeadOutboxMessage,
  type LeadOutboxFailure,
  type LeadOutboxWorkerRepository,
} from "@/application/leads/lead-outbox-worker";

const message: ClaimedLeadOutboxMessage = {
  id: "10000000-0000-4000-8000-000000000001",
  eventName: "lead.analytics_requested",
  payload: { source: "property_detail", duplicateCandidateDetected: false },
  correlationId: "20000000-0000-4000-8000-000000000001",
  idempotencyKey: "outbox-key",
  attemptCount: 1,
};
class FakeRepository implements LeadOutboxWorkerRepository {
  processed: string[] = [];
  failures: Array<{ failure: LeadOutboxFailure; delay: number }> = [];
  constructor(readonly messages: ClaimedLeadOutboxMessage[] = [message]) {}
  async claim() {
    return this.messages;
  }
  async markProcessed(id: string) {
    this.processed.push(id);
  }
  async markFailed(
    _id: string,
    _workerId: string,
    failure: LeadOutboxFailure,
    retryDelayMs: number,
  ) {
    this.failures.push({ failure, delay: retryDelayMs });
  }
}
const options = {
  workerId: "worker-a",
  limit: 10,
  leaseMs: 60_000,
  retryDelayMs: 5000,
};

describe("lead outbox worker", () => {
  it("passes the durable idempotency key to a successful provider and marks once", async () => {
    const repository = new FakeRepository();
    let received = "";
    await processLeadOutboxBatch(
      repository,
      {
        notification: async () => {},
        analytics: async (claimed) => {
          received = claimed.idempotencyKey;
        },
      },
      options,
    );
    expect(received).toBe("outbox-key");
    expect(repository.processed).toEqual([message.id]);
    expect(repository.failures).toEqual([]);
  });

  it("returns retryable delivery failures to the durable retry state", async () => {
    const repository = new FakeRepository();
    await processLeadOutboxBatch(
      repository,
      {
        notification: async () => {},
        analytics: async () => {
          throw new LeadOutboxDeliveryError("TEMP_DOWN", true);
        },
      },
      options,
    );
    expect(repository.failures).toEqual([
      { failure: { code: "TEMP_DOWN", retryable: true }, delay: 5000 },
    ]);
  });

  it("dead-letters non-retryable provider failures without affecting CRM state", async () => {
    const repository = new FakeRepository();
    await processLeadOutboxBatch(
      repository,
      {
        notification: async () => {},
        analytics: async () => {
          throw new LeadOutboxDeliveryError("INVALID_CONTRACT", false);
        },
      },
      options,
    );
    expect(repository.failures).toEqual([
      { failure: { code: "INVALID_CONTRACT", retryable: false }, delay: 5000 },
    ]);
    expect(repository.processed).toEqual([]);
  });
});
