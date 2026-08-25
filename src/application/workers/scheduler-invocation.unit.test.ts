import { describe, expect, it, vi } from "vitest";

import {
  authenticateSchedulerRequest,
  executeScheduledWorker,
} from "@/application/workers/scheduler-invocation";

const secret = "x".repeat(40);

describe("scheduler invocation boundary", () => {
  it("fails closed when the scheduler secret is missing or invalid", () => {
    expect(() =>
      authenticateSchedulerRequest(undefined, `Bearer ${secret}`),
    ).toThrow("SCHEDULER_SECRET_MISSING");
    expect(() =>
      authenticateSchedulerRequest(secret, "Bearer wrong-secret"),
    ).toThrow("SCHEDULER_UNAUTHORIZED");
    expect(() => authenticateSchedulerRequest(secret, undefined)).toThrow(
      "SCHEDULER_UNAUTHORIZED",
    );
  });

  it("accepts only the exact bearer secret", () => {
    expect(
      authenticateSchedulerRequest(secret, `Bearer ${secret}`),
    ).toBeUndefined();
  });

  it("returns a bounded PII-free structured result with the run identifier", async () => {
    const run = vi.fn().mockResolvedValue({
      claimed: 2,
      succeeded: 1,
      retried: 1,
      deadLettered: 0,
    });

    const result = await executeScheduledWorker({
      operation: "lead.outbox",
      runId: "30000000-0000-4000-8000-000000000003",
      run,
    });

    expect(result).toEqual({
      operation: "lead.outbox",
      runId: "30000000-0000-4000-8000-000000000003",
      outcome: "completed",
      claimed: 2,
      succeeded: 1,
      retried: 1,
      deadLettered: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/email|phone|payload/i);
  });

  it("rejects non-canonical run identifiers before running work", async () => {
    const run = vi.fn();
    await expect(
      executeScheduledWorker({
        operation: "media.process",
        runId: "unbounded-user-value",
        run,
      }),
    ).rejects.toThrow("SCHEDULER_RUN_ID_INVALID");
    expect(run).not.toHaveBeenCalled();
  });
});
