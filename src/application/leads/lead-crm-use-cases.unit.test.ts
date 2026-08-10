import { describe, expect, it } from "vitest";

import {
  addLeadNote,
  assignLeadAdvisor,
  changeLeadStatus,
  type LeadCrmTransaction,
  type LeadCrmUnitOfWork,
  type LeadRecord,
} from "@/application/leads/lead-crm-use-cases";

const admin = {
  actor: {
    identityId: "10000000-0000-4000-8000-000000000001",
    role: "ADMIN" as const,
    aal: "aal2" as const,
    authUserId: "20000000-0000-4000-8000-000000000001",
  },
  correlationId: "30000000-0000-4000-8000-000000000001",
  requestId: "request-1",
  idempotencyKey: "command-1",
};
const advisor = {
  ...admin,
  actor: {
    ...admin.actor,
    role: "ADVISOR" as const,
    identityId: "40000000-0000-4000-8000-000000000001",
    aal: "aal1" as const,
  },
};
const lead = {
  id: "50000000-0000-4000-8000-000000000001",
  status: "NEW",
  version: 1n,
  assignedAdvisorId: "60000000-0000-4000-8000-000000000001",
  deletedAt: null,
} as const;

class FakeUow implements LeadCrmUnitOfWork {
  calls: string[] = [];
  current: LeadRecord = lead;
  advisorId = "60000000-0000-4000-8000-000000000001";
  readonly tx: LeadCrmTransaction = {
    getLead: async () => this.current,
    currentAdvisorId: async () => this.advisorId,
    advisorExists: async () => true,
    updateStatus: async () => {
      this.calls.push("status");
      return true;
    },
    updateAssignment: async () => {
      this.calls.push("assignment");
      return true;
    },
    insertActivity: async () => {
      this.calls.push("activity");
    },
    insertAssignmentHistory: async () => {
      this.calls.push("history");
    },
    insertAudit: async () => {
      this.calls.push("audit");
    },
  };
  async transaction<T>(work: (tx: LeadCrmTransaction) => Promise<T>) {
    this.calls.push("begin");
    const value = await work(this.tx);
    this.calls.push("commit");
    return value;
  }
}

describe("lead CRM commands", () => {
  it("writes a valid status transition, activity and audit atomically", async () => {
    const uow = new FakeUow();
    await changeLeadStatus(uow, admin, {
      leadId: lead.id,
      expectedVersion: 1n,
      status: "CONTACTED",
    });
    expect(uow.calls).toEqual([
      "begin",
      "status",
      "activity",
      "audit",
      "commit",
    ]);
  });
  it("denies invalid or terminal transitions and stale updates", async () => {
    const uow = new FakeUow();
    await expect(
      changeLeadStatus(uow, admin, {
        leadId: lead.id,
        expectedVersion: 1n,
        status: "WON",
      }),
    ).rejects.toMatchObject({ code: "LEAD_INVALID_TRANSITION" });
    await expect(
      changeLeadStatus(uow, admin, {
        leadId: lead.id,
        expectedVersion: 2n,
        status: "CONTACTED",
      }),
    ).rejects.toMatchObject({ code: "LEAD_CONFLICT" });
    uow.current = { ...lead, status: "WON" };
    await expect(
      changeLeadStatus(uow, admin, {
        leadId: lead.id,
        expectedVersion: 1n,
        status: "LOST",
      }),
    ).rejects.toMatchObject({ code: "LEAD_INVALID_TRANSITION" });
  });
  it("denies advisor IDOR and assignment while allowing an assigned advisor note", async () => {
    const uow = new FakeUow();
    uow.advisorId = "other-advisor";
    await expect(
      addLeadNote(uow, advisor, {
        leadId: lead.id,
        expectedVersion: 1n,
        summary: "Not",
      }),
    ).rejects.toMatchObject({ code: "LEAD_FORBIDDEN" });
    await expect(
      assignLeadAdvisor(uow, advisor, {
        leadId: lead.id,
        expectedVersion: 1n,
        advisorId: null,
      }),
    ).rejects.toMatchObject({ code: "LEAD_FORBIDDEN" });
    uow.advisorId = lead.assignedAdvisorId;
    await addLeadNote(uow, advisor, {
      leadId: lead.id,
      expectedVersion: 1n,
      summary: "Arandı",
    });
    expect(uow.calls).toContain("activity");
  });
  it("allows only ADMIN to atomically assign/reassign with append-only history", async () => {
    const uow = new FakeUow();
    await assignLeadAdvisor(uow, admin, {
      leadId: lead.id,
      expectedVersion: 1n,
      advisorId: null,
    });
    expect(uow.calls).toEqual([
      "begin",
      "assignment",
      "activity",
      "history",
      "audit",
      "commit",
    ]);
  });
});
