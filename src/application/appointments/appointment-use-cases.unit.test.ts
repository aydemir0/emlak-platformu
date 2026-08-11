import { describe, expect, it } from "vitest";
import {
  createAppointment,
  mutateAppointment,
  type AppointmentTransaction,
  type AppointmentUnitOfWork,
} from "@/application/appointments/appointment-use-cases";

const id = "10000000-0000-4000-8000-000000000001";
const context = {
  actor: {
    identityId: id,
    authUserId: "20000000-0000-4000-8000-000000000001",
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: "30000000-0000-4000-8000-000000000001",
  requestId: "request",
  idempotencyKey: "40000000-0000-4000-8000-000000000001",
};
class FakeUow implements AppointmentUnitOfWork {
  calls: string[] = [];
  tx: AppointmentTransaction = {
    getAppointment: async () => ({
      id,
      leadId: "50000000-0000-4000-8000-000000000001",
      advisorId: "60000000-0000-4000-8000-000000000001",
      status: "REQUESTED",
      version: 1n,
      startsAt: new Date("2099-01-01T10:00:00Z"),
      deletedAt: null,
    }),
    currentAdvisorId: async () => "60000000-0000-4000-8000-000000000001",
    canManageLead: async () => true,
    advisorExists: async () => true,
    create: async () => ({
      id,
      leadId: id,
      advisorId: id,
      status: "REQUESTED",
      version: 1n,
      startsAt: new Date("2099-01-01T10:00:00Z"),
      deletedAt: null,
    }),
    mutate: async () => {
      this.calls.push("mutate");
      return true;
    },
    insertEvent: async () => {
      this.calls.push("event");
    },
    insertAudit: async () => {
      this.calls.push("audit");
    },
    insertOutbox: async () => {
      this.calls.push("outbox");
    },
  };
  async transaction<T>(work: (tx: AppointmentTransaction) => Promise<T>) {
    this.calls.push("begin");
    const result = await work(this.tx);
    this.calls.push("commit");
    return result;
  }
  async recordAuthorizationDenial() {
    this.calls.push("denial");
  }
}
describe("appointment commands", () => {
  it("confirms atomically with event and audit", async () => {
    const u = new FakeUow();
    await mutateAppointment(u, context, {
      appointmentId: id,
      expectedVersion: 1n,
      eventType: "CONFIRMED",
      status: "CONFIRMED",
    });
    expect(u.calls).toEqual([
      "begin",
      "mutate",
      "event",
      "audit",
      "outbox",
      "commit",
    ]);
  });
  it("rejects stale and unauthorized mutation", async () => {
    const u = new FakeUow();
    await expect(
      mutateAppointment(u, context, {
        appointmentId: id,
        expectedVersion: 2n,
        eventType: "CONFIRMED",
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
  });
  it("creates requested appointment without client actor derivation", async () => {
    const u = new FakeUow();
    await createAppointment(u, context, {
      leadId: id,
      advisorId: id,
      startsAt: new Date("2026-08-20T10:00:00Z"),
      endsAt: new Date("2026-08-20T11:00:00Z"),
      scheduledTimezone: "Europe/Istanbul",
    });
    expect(u.calls).toEqual(["begin", "event", "audit", "commit"]);
  });
});
