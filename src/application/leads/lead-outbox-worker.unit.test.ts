import { describe, expect, it, vi } from "vitest";

import {
  LeadOutboxDeliveryError,
  processLeadOutboxBatch,
  type ClaimedLeadOutboxMessage,
  type LeadOutboxFailure,
  type LeadOutboxWorkerRepository,
} from "@/application/leads/lead-outbox-worker";
import { WorkerLeaseLostError } from "@/application/observability/worker-run";

const message: ClaimedLeadOutboxMessage = {
  id: "10000000-0000-4000-8000-000000000001",
  eventName: "lead.analytics_requested",
  payload: { source: "property_detail", duplicateCandidateDetected: false },
  correlationId: "20000000-0000-4000-8000-000000000001",
  idempotencyKey: "outbox-key",
  attemptCount: 1,
  recoveredStaleLease: false,
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
const reportRun = vi.fn();
const options = {
  workerId: "worker-a",
  limit: 10,
  leaseMs: 60_000,
  retryDelayMs: 5000,
  maxAttempts: 3,
  correlationId: "lead-worker-run-1",
  reportRun,
};

describe("lead outbox worker", () => {
  it("passes the durable idempotency key to a successful provider and marks once", async () => {
    const repository = new FakeRepository();
    let received = "";
    const summary = await processLeadOutboxBatch(
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
    expect(summary).toEqual({
      operation: "lead.outbox",
      correlationId: "lead-worker-run-1",
      claimed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      durationMs: expect.any(Number),
      failureCategories: {
        application: 0,
        dependency: 0,
        storage: 0,
        validation: 0,
      },
    });
    expect(reportRun).toHaveBeenCalledWith(summary);
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

  it("dead-letters deterministic PII poison without invoking a provider", async () => {
    const repository = new FakeRepository([
      { ...message, payload: { email: "customer@example.test" } },
    ]);
    const analytics = vi.fn();

    const summary = await processLeadOutboxBatch(
      repository,
      { notification: async () => {}, analytics },
      options,
    );

    expect(analytics).not.toHaveBeenCalled();
    expect(repository.failures).toEqual([
      {
        failure: { code: "LEAD_OUTBOX_PII", retryable: false },
        delay: 5000,
      },
    ]);
    expect(summary).toMatchObject({
      retried: 0,
      deadLettered: 1,
      failureCategories: { validation: 1 },
    });
  });

  it("dead-letters a retryable poison message at the explicit attempt ceiling", async () => {
    const repository = new FakeRepository([{ ...message, attemptCount: 3 }]);
    const summary = await processLeadOutboxBatch(
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
      {
        failure: {
          code: "LEAD_OUTBOX_MAX_ATTEMPTS_EXCEEDED",
          retryable: false,
        },
        delay: 5000,
      },
    ]);
    expect(summary).toMatchObject({
      retried: 0,
      deadLettered: 1,
      failureCategories: { dependency: 1 },
    });
  });

  it("counts reclaimed stale leases without exposing message payloads", async () => {
    const repository = new FakeRepository([
      { ...message, recoveredStaleLease: true },
    ]);
    const summary = await processLeadOutboxBatch(
      repository,
      { notification: async () => {}, analytics: async () => {} },
      options,
    );

    expect(summary.staleRecovered).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/property_detail|outbox-key/i);
  });

  it("rejects an unbounded retry policy before claiming work", async () => {
    const repository = new FakeRepository();

    await expect(
      processLeadOutboxBatch(
        repository,
        { notification: async () => {}, analytics: async () => {} },
        { ...options, maxAttempts: 0, retryDelayMs: 3_600_001 },
      ),
    ).rejects.toThrow("WORKER_RETRY_POLICY_INVALID");
  });

  it("reports a safe dependency category when claiming fails", async () => {
    const claimError = new Error(
      "postgres://user:password@db.internal/customer@example.test",
    );
    const repository = new FakeRepository();
    repository.claim = async () => {
      throw claimError;
    };

    await expect(
      processLeadOutboxBatch(
        repository,
        { notification: async () => {}, analytics: async () => {} },
        options,
      ),
    ).rejects.toBe(claimError);
    expect(reportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: 0,
        succeeded: 0,
        retried: 0,
        deadLettered: 0,
        failureCategories: {
          application: 0,
          dependency: 1,
          storage: 0,
          validation: 0,
        },
      }),
    );
    expect(JSON.stringify(reportRun.mock.calls)).not.toMatch(
      /password|customer@example/i,
    );
  });

  it("does not claim success after a concurrent lease loss and reports once", async () => {
    const repository = new FakeRepository();
    const leaseError = new WorkerLeaseLostError("lead.outbox", message.id);
    repository.markProcessed = async () => {
      throw leaseError;
    };
    const reporter = vi.fn();

    await expect(
      processLeadOutboxBatch(
        repository,
        { notification: async () => {}, analytics: async () => {} },
        { ...options, reportRun: reporter },
      ),
    ).rejects.toBe(leaseError);
    expect(repository.failures).toEqual([]);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: 1,
        succeeded: 0,
        retried: 0,
        deadLettered: 0,
      }),
    );
  });

  it("emits one progress-preserving summary when terminalization fails", async () => {
    const repository = new FakeRepository();
    const terminalizationError = new Error("database unavailable");
    repository.markFailed = async () => {
      throw terminalizationError;
    };
    const reporter = vi.fn();

    await expect(
      processLeadOutboxBatch(
        repository,
        {
          notification: async () => {},
          analytics: async () => {
            throw new LeadOutboxDeliveryError("TEMP_DOWN", true);
          },
        },
        { ...options, reportRun: reporter },
      ),
    ).rejects.toBe(terminalizationError);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: 1, retried: 0, deadLettered: 0 }),
    );
  });
});
