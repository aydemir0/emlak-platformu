import { describe, expect, it } from "vitest";

import type { LeadConversionTransaction } from "@/application/leads/convert-lead-to-customer";
import {
  convertLeadToCustomer,
  type LeadConversionUnitOfWork,
  type LeadForConversion,
} from "@/application/leads/convert-lead-to-customer";

const context = {
  actor: {
    identityId: "10000000-0000-4000-8000-000000000001",
    authUserId: "20000000-0000-4000-8000-000000000001",
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: "30000000-0000-4000-8000-000000000001",
  requestId: "lead-conversion-unit",
  idempotencyKey: "40000000-0000-4000-8000-000000000001",
};
const lead: LeadForConversion = {
  id: "50000000-0000-4000-8000-000000000001",
  status: "NEGOTIATION",
  assignedAdvisorId: "60000000-0000-4000-8000-000000000001",
  deletedAt: null,
  name: "Ada Example",
  email: "Ada@example.test",
  phone: "+90 555 123 4567",
};

class FakeUow implements LeadConversionUnitOfWork {
  calls: string[] = [];
  denials: Record<string, unknown>[] = [];
  lead: LeadForConversion | null = lead;
  existing: Awaited<
    ReturnType<LeadConversionTransaction["findExistingConversion"]>
  > = null;
  candidates: Awaited<
    ReturnType<LeadConversionTransaction["findTrustedIdentityCandidates"]>
  > = [];
  managesCustomer = true;
  advisorId = lead.assignedAdvisorId;
  createdRequests = 0;
  readonly tx: LeadConversionTransaction = {
    lockLead: async () => this.lead,
    findExistingConversion: async () => this.existing,
    currentAdvisorId: async () => this.advisorId,
    canManageCustomer: async () => this.managesCustomer,
    findTrustedIdentityCandidates: async () => this.candidates,
    createCustomer: async () => {
      this.calls.push("customer");
      return { id: "70000000-0000-4000-8000-000000000001" };
    },
    createCustomerContactPoints: async () => {
      this.calls.push("contacts");
    },
    createInitialRequest: async () => {
      this.calls.push("request");
      this.createdRequests += 1;
      return { id: "80000000-0000-4000-8000-000000000001" };
    },
    insertConversion: async (values) => {
      this.calls.push("conversion");
      return {
        leadId: values.leadId,
        customerId: values.customerId,
        customerRequestId: values.customerRequestId,
        outcome: values.outcome,
        resolutionKind: values.resolutionKind,
        convertedAt: new Date("2026-08-12T00:00:00.000Z"),
      };
    },
    transitionLeadToWon: async () => {
      this.calls.push("won");
      return true;
    },
    insertActivity: async () => {
      this.calls.push("activity");
    },
    insertAudit: async () => {
      this.calls.push("audit");
    },
  };
  async transaction<T>(work: (tx: LeadConversionTransaction) => Promise<T>) {
    this.calls.push("begin");
    const result = await work(this.tx);
    this.calls.push("commit");
    return result;
  }
  async recordAuthorizationDenial(values: Record<string, unknown>) {
    this.denials.push(values);
  }
}

describe("convertLeadToCustomer", () => {
  it("creates the smallest customer, contact points, request, provenance, activity and audit atomically", async () => {
    const uow = new FakeUow();
    const result = await convertLeadToCustomer(uow, context, {
      leadId: lead.id,
      createInitialRequest: true,
    });
    expect(result).toEqual({
      leadId: lead.id,
      customerId: "70000000-0000-4000-8000-000000000001",
      customerRequestId: "80000000-0000-4000-8000-000000000001",
      outcome: "WON",
      createdCustomer: true,
      resolutionKind: "CREATED_NEW_CUSTOMER",
      convertedAt: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(uow.calls).toEqual([
      "begin",
      "customer",
      "contacts",
      "request",
      "conversion",
      "won",
      "activity",
      "audit",
      "commit",
    ]);
  });

  it("links an explicit authorized customer without mutating its contacts", async () => {
    const uow = new FakeUow();
    const result = await convertLeadToCustomer(uow, context, {
      leadId: lead.id,
      explicitCustomerId: "70000000-0000-4000-8000-000000000099",
      createInitialRequest: false,
    });
    expect(result).toMatchObject({
      customerId: "70000000-0000-4000-8000-000000000099",
      createdCustomer: false,
      resolutionKind: "LINKED_EXPLICIT_CUSTOMER",
      customerRequestId: null,
    });
    expect(uow.calls).not.toContain("customer");
    expect(uow.calls).not.toContain("contacts");
  });

  it("links one exact customer even when both contacts resolve to it", async () => {
    const uow = new FakeUow();
    uow.candidates = [
      {
        customerId: "70000000-0000-4000-8000-000000000002",
        identity: { channel: "EMAIL", normalizedValue: "ada@example.test" },
      },
      {
        customerId: "70000000-0000-4000-8000-000000000002",
        identity: { channel: "PHONE", normalizedValue: "+905551234567" },
      },
    ];
    const result = await convertLeadToCustomer(uow, context, {
      leadId: lead.id,
      createInitialRequest: false,
    });
    expect(result).toMatchObject({
      customerId: "70000000-0000-4000-8000-000000000002",
      resolutionKind: "LINKED_EXACT_IDENTITY",
    });
    expect(uow.calls).not.toContain("customer");
  });

  it("rejects ambiguous identities without creating any record", async () => {
    const uow = new FakeUow();
    uow.candidates = [
      {
        customerId: "70000000-0000-4000-8000-000000000002",
        identity: { channel: "EMAIL", normalizedValue: "ada@example.test" },
      },
      {
        customerId: "70000000-0000-4000-8000-000000000003",
        identity: { channel: "PHONE", normalizedValue: "+905551234567" },
      },
    ];
    await expect(
      convertLeadToCustomer(uow, context, {
        leadId: lead.id,
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_IDENTITY_CONFLICT" });
    expect(uow.calls).toEqual(["begin"]);
  });

  it("returns an existing conversion idempotently and never creates another request", async () => {
    const uow = new FakeUow();
    uow.existing = {
      leadId: lead.id,
      customerId: "70000000-0000-4000-8000-000000000002",
      customerRequestId: "80000000-0000-4000-8000-000000000002",
      outcome: "WON",
      resolutionKind: "LINKED_EXACT_IDENTITY",
      convertedAt: new Date("2026-08-11T00:00:00.000Z"),
    };
    const result = await convertLeadToCustomer(uow, context, {
      leadId: lead.id,
      createInitialRequest: true,
    });
    expect(result).toMatchObject({ customerId: uow.existing.customerId });
    expect(uow.calls).toEqual(["begin", "commit"]);
    expect(uow.createdRequests).toBe(0);
  });

  it("rejects a retry that tries to relink the immutable conversion", async () => {
    const uow = new FakeUow();
    uow.existing = {
      leadId: lead.id,
      customerId: "70000000-0000-4000-8000-000000000002",
      customerRequestId: null,
      outcome: "WON",
      resolutionKind: "LINKED_EXPLICIT_CUSTOMER",
      convertedAt: new Date(),
    };
    await expect(
      convertLeadToCustomer(uow, context, {
        leadId: lead.id,
        explicitCustomerId: "70000000-0000-4000-8000-000000000099",
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "LEAD_CONVERSION_NOT_ALLOWED" });
  });

  it("fails closed for WON without conversion and for non-convertible states", async () => {
    const uow = new FakeUow();
    uow.lead = { ...lead, status: "WON" };
    await expect(
      convertLeadToCustomer(uow, context, {
        leadId: lead.id,
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "LEAD_CONVERSION_INTEGRITY_CONFLICT" });
    uow.lead = { ...lead, status: "NEW" };
    await expect(
      convertLeadToCustomer(uow, context, {
        leadId: lead.id,
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "LEAD_CONVERSION_NOT_ALLOWED" });
  });

  it("denies an advisor outside lead or explicit customer scope and records no PII", async () => {
    const uow = new FakeUow();
    const advisor = {
      ...context,
      actor: {
        ...context.actor,
        role: "ADVISOR" as const,
        aal: "aal1" as const,
      },
    };
    uow.advisorId = "other-advisor";
    await expect(
      convertLeadToCustomer(uow, advisor, {
        leadId: lead.id,
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "LEAD_FORBIDDEN" });
    expect(uow.denials[0]).toMatchObject({
      action: "lead.conversion_denied",
      reasonCode: "LEAD_FORBIDDEN",
    });
    uow.advisorId = lead.assignedAdvisorId;
    uow.managesCustomer = false;
    await expect(
      convertLeadToCustomer(uow, advisor, {
        leadId: lead.id,
        explicitCustomerId: "70000000-0000-4000-8000-000000000002",
        createInitialRequest: false,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_LINK_NOT_AUTHORIZED" });
    expect(JSON.stringify(uow.denials)).not.toMatch(/Ada|example|\+90/i);
  });
});
