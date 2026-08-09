import { beforeEach, describe, expect, it } from "vitest";

import { changePropertyPrice } from "@/application/properties/change-property-price";
import { updateProperty } from "@/application/properties/update-property";
import { assignAdvisor } from "@/application/properties/assign-property-advisor";
import type {
  PropertyTransaction,
  PropertyUnitOfWork,
} from "@/application/properties/property-ports";
import type { PropertyRecord } from "@/domain/properties/property";

const property: PropertyRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  publicId: "10000000-0000-4000-8000-000000000001",
  listingTypeId: "20000000-0000-4000-8000-000000000001",
  propertyTypeId: "30000000-0000-4000-8000-000000000001",
  locationId: "40000000-0000-4000-8000-000000000001",
  heatingTypeId: null,
  title: "Test property",
  description: null,
  currentState: "DRAFT",
  priceAmountMinor: 1_000_000n,
  currencyCode: "TRY",
  version: 3n,
  publishedAt: null,
  deletedAt: null,
};

const command = {
  actor: {
    authUserId: "50000000-0000-4000-8000-000000000001",
    identityId: "60000000-0000-4000-8000-000000000001",
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: "70000000-0000-4000-8000-000000000001",
  requestId: "request-1",
  idempotencyKey: "idempotency-1",
};

class FakeUnitOfWork implements PropertyUnitOfWork {
  calls: string[] = [];
  assigned = false;
  current: PropertyRecord | null = property;
  updateSucceeds = true;

  readonly tx: PropertyTransaction = {
    loadAuthorizationFacts: async (currentContext) => ({
      active: true,
      role: currentContext.actor.role,
      aal: currentContext.actor.aal,
      permissions: new Set<string>(),
      advisorId:
        currentContext.actor.role === "ADVISOR"
          ? "80000000-0000-4000-8000-000000000001"
          : null,
    }),
    isAdvisorAssigned: async () => this.assigned,
    getProperty: async () => this.current,
    referencesExist: async () => true,
    getPublicationReadiness: async () => ({
      canonicalRouteReady: true,
      publicFactsReady: true,
      mediaReady: true,
    }),
    insertProperty: async () => {
      throw new Error("unused");
    },
    updateProperty: async () => {
      this.calls.push("property");
      return this.updateSucceeds;
    },
    insertPriceHistory: async () => {
      this.calls.push("price-history");
    },
    insertStateHistory: async () => {
      this.calls.push("state-history");
    },
    insertAdvisorAssignment: async () => {
      this.calls.push("assignment");
    },
    insertAuditLog: async () => {
      this.calls.push("audit");
    },
    insertOutboxMessage: async () => {
      this.calls.push("outbox");
    },
  };

  async transaction<T>(work: (tx: PropertyTransaction) => Promise<T>) {
    this.calls.push("begin");
    const result = await work(this.tx);
    this.calls.push("commit");
    return result;
  }

  async recordDeniedCommand() {
    this.calls.push("denied-audit");
  }
}

describe("property mutation use cases", () => {
  let uow: FakeUnitOfWork;

  beforeEach(() => {
    uow = new FakeUnitOfWork();
  });

  it("rejects a stale ordinary edit without history, audit, or outbox writes", async () => {
    uow.updateSucceeds = false;
    await expect(
      updateProperty(uow, command, {
        propertyId: property.id,
        expectedVersion: 2n,
        title: "Changed",
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_CONFLICT" });
    expect(uow.calls).toEqual(["begin", "property"]);
  });

  it("updates details with audit and durable invalidation in one transaction", async () => {
    await updateProperty(uow, command, {
      propertyId: property.id,
      expectedVersion: 3n,
      title: "Changed",
    });
    expect(uow.calls).toEqual([
      "begin",
      "property",
      "audit",
      "outbox",
      "commit",
    ]);
  });

  it("does not disclose a cross-advisor property through update", async () => {
    const advisorCommand = {
      ...command,
      actor: {
        ...command.actor,
        role: "ADVISOR" as const,
        aal: "aal1" as const,
      },
    };
    await expect(
      updateProperty(uow, advisorCommand, {
        propertyId: property.id,
        expectedVersion: 3n,
        title: "Changed",
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_FORBIDDEN" });
    expect(uow.calls).toEqual(["begin", "denied-audit"]);
  });

  it("does not expose a soft-deleted property to ordinary edit commands", async () => {
    uow.current = { ...property, deletedAt: new Date("2026-08-01T00:00:00Z") };
    await expect(
      updateProperty(uow, command, {
        propertyId: property.id,
        expectedVersion: 3n,
        title: "Changed",
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_NOT_FOUND" });
    expect(uow.calls).toEqual(["begin"]);
  });

  it("changes price with history, audit, and outbox in the same transaction", async () => {
    await changePropertyPrice(uow, command, {
      propertyId: property.id,
      expectedVersion: 3n,
      amountMinor: 1_250_000n,
      currencyCode: "TRY",
      effectiveAt: new Date("2026-08-09T12:00:00Z"),
      source: "ADMIN",
      reasonCode: null,
    });
    expect(uow.calls).toEqual([
      "begin",
      "property",
      "price-history",
      "audit",
      "outbox",
      "commit",
    ]);
  });

  it("assigns an advisor with caller-supplied role semantics and atomic evidence", async () => {
    await assignAdvisor(uow, command, {
      propertyId: property.id,
      advisorId: "80000000-0000-4000-8000-000000000001",
      assignmentRole: "OWNER",
      isPrimary: true,
      reason: null,
    });
    expect(uow.calls).toEqual([
      "begin",
      "assignment",
      "audit",
      "outbox",
      "commit",
    ]);
  });
});
