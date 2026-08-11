import { describe, expect, it } from "vitest";
import { processAppointmentReminderBatch } from "@/application/appointments/appointment-reminder-outbox";
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
const options = {
  workerId: "worker",
  limit: 10,
  leaseMs: 60_000,
  retryDelayMs: 1_000,
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
    await processAppointmentReminderBatch(
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
});
