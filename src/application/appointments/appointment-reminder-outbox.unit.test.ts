import { describe, expect, it, vi } from "vitest";
import { processAppointmentReminderBatch } from "@/application/appointments/appointment-reminder-outbox";
import { WorkerLeaseLostError } from "@/application/observability/worker-run";
import { createAppointmentReminderPolicy } from "@/domain/appointments/appointment-reminder-policy";

const payload = {
  appointmentId: "10000000-0000-4000-8000-000000000001",
  appointmentVersion: 2n,
  scheduledFor: new Date("2099-01-01T09:00:00Z"),
  reminderKind: "standard" as const,
};
class Repo {
  processed: string[] = [];
  failures: unknown[] = [];
  current = {
    version: 2n,
    status: "CONFIRMED" as const,
    startsAt: new Date("2099-01-01T10:00:00Z"),
    deletedAt: null,
  };
  constructor(
    readonly messages = [
      {
        id: "outbox",
        payload,
        correlationId: "20000000-0000-4000-8000-000000000001",
        idempotencyKey: "key",
        attemptCount: 1,
        recoveredStaleLease: false,
      },
    ],
  ) {}
  async claim() {
    return this.messages;
  }
  async currentAppointment() {
    return this.current;
  }
  async markProcessed(id: string) {
    this.processed.push(id);
  }
  async markFailed(_: string, __: string, failure: unknown) {
    this.failures.push(failure);
  }
}
const reportRun = vi.fn();
const options = {
  workerId: "worker",
  limit: 10,
  leaseMs: 60_000,
  retryDelayMs: 1_000,
  maxAttempts: 3,
  correlationId: "appointment-worker-run-1",
  reportRun,
};
describe("appointment reminder outbox", () => {
  it("uses a configurable confirmed-only policy", () => {
    const policy = createAppointmentReminderPolicy(60);
    expect(
      policy.intents({
        status: "CONFIRMED",
        startsAt: new Date("2099-01-01T10:00:00Z"),
        now: new Date("2099-01-01T08:00:00Z"),
      }),
    ).toHaveLength(1);
    expect(
      policy.intents({
        status: "CANCELLED",
        startsAt: new Date("2099-01-01T10:00:00Z"),
        now: new Date("2099-01-01T08:00:00Z"),
      }),
    ).toEqual([]);
  });
  it("sends a current reminder once and suppresses stale or terminal work", async () => {
    const repo = new Repo();
    const sent: string[] = [];
    const summary = await processAppointmentReminderBatch(
      repo,
      {
        notify: async ({ idempotencyKey }) => {
          sent.push(idempotencyKey);
        },
      },
      options,
    );
    expect(sent).toEqual(["key"]);
    expect(repo.processed).toEqual(["outbox"]);
    expect(summary).toMatchObject({
      operation: "appointment.reminder",
      correlationId: "appointment-worker-run-1",
      claimed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      failureCategories: {
        application: 0,
        dependency: 0,
        storage: 0,
        validation: 0,
      },
    });
    expect(reportRun).toHaveBeenCalledWith(summary);
    const stale = new Repo();
    stale.current = { ...stale.current, version: 3n };
    await processAppointmentReminderBatch(
      stale,
      {
        notify: async () => {
          throw new Error("must not send");
        },
      },
      options,
    );
    expect(stale.processed).toEqual(["outbox"]);
  });
  it("keeps provider failure retryable and rejects malformed payload safely", async () => {
    const retry = new Repo();
    await processAppointmentReminderBatch(
      retry,
      {
        notify: async () => {
          throw new Error("down");
        },
      },
      options,
    );
    expect(retry.failures).toEqual([
      { code: "APPOINTMENT_REMINDER_DELIVERY_FAILED", retryable: true },
    ]);
    const malformed = new Repo([
      {
        id: "bad",
        payload: { email: "x@example.test" } as never,
        correlationId: "x",
        idempotencyKey: "x",
        attemptCount: 1,
        recoveredStaleLease: false,
      },
    ]);
    await processAppointmentReminderBatch(
      malformed,
      { notify: async () => {} },
      options,
    );
    expect(malformed.failures).toEqual([
      { code: "APPOINTMENT_REMINDER_INVALID_PAYLOAD", retryable: false },
    ]);
  });

  it("dead-letters retryable reminder poison at the explicit attempt ceiling", async () => {
    const repo = new Repo([
      {
        id: "poison",
        payload,
        correlationId: "20000000-0000-4000-8000-000000000001",
        idempotencyKey: "poison-key",
        attemptCount: 3,
        recoveredStaleLease: true,
      },
    ]);

    const summary = await processAppointmentReminderBatch(
      repo,
      {
        notify: async () => {
          throw new Error("provider included customer@example.test");
        },
      },
      options,
    );

    expect(repo.failures).toEqual([
      {
        code: "APPOINTMENT_REMINDER_MAX_ATTEMPTS_EXCEEDED",
        retryable: false,
      },
    ]);
    expect(summary).toMatchObject({
      retried: 0,
      deadLettered: 1,
      staleRecovered: 1,
      failureCategories: { dependency: 1 },
    });
    expect(JSON.stringify(summary)).not.toContain("customer@example.test");
  });

  it("rejects unbounded batch and lease values before claiming work", async () => {
    const repo = new Repo();

    await expect(
      processAppointmentReminderBatch(
        repo,
        { notify: async () => {} },
        { ...options, limit: 101, leaseMs: 900_001 },
      ),
    ).rejects.toThrow("WORKER_EXECUTION_POLICY_INVALID");
  });

  it("does not claim success after a concurrent lease loss and reports once", async () => {
    const repo = new Repo();
    const leaseError = new WorkerLeaseLostError(
      "appointment.reminder",
      "outbox",
    );
    repo.markProcessed = async () => {
      throw leaseError;
    };
    const reporter = vi.fn();

    await expect(
      processAppointmentReminderBatch(
        repo,
        { notify: async () => {} },
        { ...options, reportRun: reporter },
      ),
    ).rejects.toBe(leaseError);
    expect(repo.failures).toEqual([]);
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

  it("emits one progress-preserving summary when appointment lookup fails", async () => {
    const repo = new Repo();
    const lookupError = new Error("database unavailable");
    repo.currentAppointment = async () => {
      throw lookupError;
    };
    const reporter = vi.fn();

    await expect(
      processAppointmentReminderBatch(
        repo,
        { notify: async () => {} },
        { ...options, reportRun: reporter },
      ),
    ).rejects.toBe(lookupError);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: 1, succeeded: 0 }),
    );
  });

  it("emits one progress-preserving summary when terminalization fails", async () => {
    const repo = new Repo();
    const terminalizationError = new Error("database unavailable");
    repo.markFailed = async () => {
      throw terminalizationError;
    };
    const reporter = vi.fn();

    await expect(
      processAppointmentReminderBatch(
        repo,
        {
          notify: async () => {
            throw new Error("provider unavailable");
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
