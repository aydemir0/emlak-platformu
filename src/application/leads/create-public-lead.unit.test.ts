import { describe, expect, it } from "vitest";

import {
  createPublicLead,
  type PublicLeadTransaction,
  type PublicLeadUnitOfWork,
} from "@/application/leads/create-public-lead";

const property = {
  id: "10000000-0000-4000-8000-000000000001",
  publicId: "public-property-1",
};

class FakePublicLeadUnitOfWork implements PublicLeadUnitOfWork {
  calls: string[] = [];
  visibleProperty: { id: string; publicId: string } | null = property;
  existing: { fingerprint: string; leadId: string } | null = null;
  duplicateCandidateIds: readonly string[] = [];
  limited = false;
  failOutbox = false;
  created: Record<string, unknown> | null = null;
  activities: Record<string, unknown>[] = [];
  audits: Record<string, unknown>[] = [];
  outbox: Record<string, unknown>[] = [];

  readonly tx: PublicLeadTransaction = {
    findPublicEligibleProperty: async () => this.visibleProperty,
    findByIdempotencyKey: async () => this.existing,
    acquireRateLimit: async () => !this.limited,
    findDuplicateCandidateIds: async () => this.duplicateCandidateIds,
    insertLead: async (values) => {
      this.calls.push("lead");
      this.created = values;
      return { id: "20000000-0000-4000-8000-000000000001" };
    },
    insertContactIntake: async () => {
      this.calls.push("contact");
    },
    insertLeadActivity: async (values) => {
      this.calls.push("activity");
      this.activities.push(values);
    },
    insertAuditLog: async (values) => {
      this.calls.push("audit");
      this.audits.push(values);
    },
    insertOutboxMessage: async (values) => {
      this.calls.push("outbox");
      this.outbox.push(values);
      if (this.failOutbox) throw new Error("outbox unavailable");
    },
  };

  async transaction<T>(work: (tx: PublicLeadTransaction) => Promise<T>) {
    this.calls.push("begin");
    try {
      const result = await work(this.tx);
      this.calls.push("commit");
      return result;
    } catch (error) {
      this.calls.push("rollback");
      throw error;
    }
  }
}

const baseInput = {
  propertyId: property.publicId,
  email: " Person@Example.test ",
  phone: undefined,
  name: "Ada",
  message: "Bilgi almak istiyorum",
  consentAccepted: true,
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
  idempotencyFingerprint: "c".repeat(64),
  correlationId: "40000000-0000-4000-8000-000000000001",
  requestId: "request-1",
  abuseNetworkSignal: "a".repeat(64),
};

describe("createPublicLead", () => {
  it("accepts an email-only submission and writes PII-minimized durable effects atomically", async () => {
    const uow = new FakePublicLeadUnitOfWork();

    await expect(createPublicLead(uow, baseInput)).resolves.toEqual({
      kind: "ACCEPTED",
    });

    expect(uow.calls).toEqual([
      "begin",
      "lead",
      "contact",
      "activity",
      "audit",
      "outbox",
      "outbox",
      "commit",
    ]);
    expect(uow.created).toMatchObject({
      assignedAdvisorId: null,
      email: "Person@Example.test",
      phone: null,
      abuseNetworkSignal: "a".repeat(64),
    });
    expect(uow.created).not.toHaveProperty("customerId");
    expect(JSON.stringify(uow.outbox)).not.toMatch(
      /Person@Example\.test|Ada|Bilgi almak/i,
    );
  });

  it("accepts a phone-only submission without guessing its normalization", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    const input = {
      ...baseInput,
      email: undefined,
      phone: "+90 555 000 00 00",
      idempotencyKey: "30000000-0000-4000-8000-000000000002",
    };

    await expect(createPublicLead(uow, input)).resolves.toEqual({
      kind: "ACCEPTED",
    });
    expect(uow.created).toMatchObject({ phone: "+90 555 000 00 00" });
  });

  it("rejects a submission with neither contact channel", async () => {
    const uow = new FakePublicLeadUnitOfWork();

    await expect(
      createPublicLead(uow, {
        ...baseInput,
        email: undefined,
        phone: undefined,
      }),
    ).rejects.toMatchObject({
      code: "LEAD_VALIDATION_FAILED",
    });
  });

  it("denies invisible properties without creating a lead", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    uow.visibleProperty = null;

    await expect(createPublicLead(uow, baseInput)).rejects.toMatchObject({
      code: "LEAD_NOT_FOUND",
    });
    expect(uow.calls).toEqual(["begin", "rollback"]);
  });

  it("replays an exact idempotent submission without another write", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    uow.existing = {
      fingerprint: "f".repeat(64),
      leadId: "20000000-0000-4000-8000-000000000001",
    };

    await expect(
      createPublicLead(uow, {
        ...baseInput,
        idempotencyFingerprint: "f".repeat(64),
      }),
    ).resolves.toEqual({ kind: "ACCEPTED" });
    expect(uow.calls).toEqual(["begin", "commit"]);
  });

  it("records a duplicate candidate while preserving an independent submission", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    uow.duplicateCandidateIds = ["50000000-0000-4000-8000-000000000001"];

    await createPublicLead(uow, baseInput);

    expect(uow.activities).toHaveLength(2);
    expect(uow.activities[1]).toMatchObject({
      activityType: "DUPLICATE_CANDIDATE_DETECTED",
      details: {
        candidateLeadIds: ["50000000-0000-4000-8000-000000000001"],
      },
    });
  });

  it("denies rate-limited traffic before creating a lead", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    uow.limited = true;

    await expect(createPublicLead(uow, baseInput)).rejects.toMatchObject({
      code: "LEAD_FORBIDDEN",
    });
    expect(uow.calls).toEqual(["begin", "rollback"]);
  });

  it("rolls back authoritative lead writes when the outbox write fails", async () => {
    const uow = new FakePublicLeadUnitOfWork();
    uow.failOutbox = true;

    await expect(createPublicLead(uow, baseInput)).rejects.toThrow(
      "outbox unavailable",
    );
    expect(uow.calls).toContain("rollback");
    expect(uow.calls).not.toContain("commit");
  });
});
