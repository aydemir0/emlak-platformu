import { describe, expect, it } from "vitest";

import {
  archiveProperty,
  markPropertyRented,
  markPropertySold,
  publishProperty,
  reserveProperty,
  restoreProperty,
  softDeleteProperty,
  submitPropertyForReview,
  unpublishProperty,
} from "@/application/properties/property-lifecycle-use-cases";
import type {
  PropertyTransaction,
  PropertyUnitOfWork,
} from "@/application/properties/property-ports";
import type { PropertyRecord } from "@/domain/properties/property";

const base: PropertyRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  publicId: "10000000-0000-4000-8000-000000000001",
  listingTypeId: "20000000-0000-4000-8000-000000000001",
  propertyTypeId: "30000000-0000-4000-8000-000000000001",
  locationId: "40000000-0000-4000-8000-000000000001",
  heatingTypeId: null,
  title: "Test",
  description: null,
  currentState: "REVIEW",
  priceAmountMinor: 1n,
  currencyCode: "TRY",
  version: 1n,
  publishedAt: null,
  deletedAt: null,
};

const context = {
  actor: {
    authUserId: "50000000-0000-4000-8000-000000000001",
    identityId: "60000000-0000-4000-8000-000000000001",
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: "70000000-0000-4000-8000-000000000001",
  requestId: "request-1",
  idempotencyKey: "state-1",
};

function makeUow(record: PropertyRecord, publicationReady = true) {
  const calls: string[] = [];
  const tx: PropertyTransaction = {
    loadAuthorizationFacts: async () => ({
      active: true,
      role: "ADMIN",
      aal: "aal2",
      permissions: new Set(),
      advisorId: null,
    }),
    isAdvisorAssigned: async () => false,
    getProperty: async (_id, options) => {
      calls.push(options.lock ? "lock" : "read");
      return record;
    },
    referencesExist: async () => true,
    getPublicationReadiness: async () => ({
      canonicalRouteReady: publicationReady,
      publicFactsReady: publicationReady,
      mediaReady: publicationReady,
    }),
    insertProperty: async () => record,
    updateProperty: async () => (calls.push("property"), true),
    insertPriceHistory: async () => undefined,
    insertStateHistory: async () => {
      calls.push("state-history");
    },
    insertAdvisorAssignment: async () => undefined,
    insertAuditLog: async () => {
      calls.push("audit");
    },
    insertOutboxMessage: async () => {
      calls.push("outbox");
    },
  };
  const uow: PropertyUnitOfWork = {
    transaction: async (work) => {
      calls.push("begin");
      const result = await work(tx);
      calls.push("commit");
      return result;
    },
    recordDeniedCommand: async () => {
      calls.push("denied-audit");
    },
  };
  return { uow, calls };
}

describe("property lifecycle use cases", () => {
  it.each([
    ["submit", "DRAFT", "REVIEW", submitPropertyForReview, {}],
    ["publish", "REVIEW", "ACTIVE", publishProperty, {}],
    ["unpublish", "ACTIVE", "REVIEW", unpublishProperty, {}],
    [
      "reserve",
      "ACTIVE",
      "RESERVED",
      reserveProperty,
      {
        reservationReference: "RES-1",
        reservationAdvisorId: "92000000-0000-4000-8000-000000000001",
        reservationExpiresAt: new Date("2026-08-10T00:00:00Z"),
      },
    ],
    [
      "sold",
      "RESERVED",
      "SOLD",
      markPropertySold,
      {
        closingAmountMinor: 100n,
        closingCurrencyCode: "TRY",
        closingDate: "2026-08-09",
      },
    ],
    [
      "rented",
      "RESERVED",
      "RENTED",
      markPropertyRented,
      {
        closingAmountMinor: 100n,
        closingCurrencyCode: "TRY",
        closingDate: "2026-08-09",
      },
    ],
    ["archive", "ACTIVE", "ARCHIVED", archiveProperty, {}],
  ] as const)(
    "executes the %s named command",
    async (_name, from, _to, useCase, evidence) => {
      const { uow, calls } = makeUow({ ...base, currentState: from });
      await useCase(uow, context, {
        propertyId: base.id,
        expectedVersion: 1n,
        reasonCode: null,
        ...evidence,
      });
      expect(calls).toEqual([
        "begin",
        "lock",
        "property",
        "state-history",
        "audit",
        "outbox",
        "commit",
      ]);
    },
  );

  it("fails publication closed until route/readiness is available", async () => {
    const { uow, calls } = makeUow(base, false);
    await expect(
      publishProperty(uow, context, {
        propertyId: base.id,
        expectedVersion: 1n,
        reasonCode: null,
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_VALIDATION_FAILED" });
    expect(calls).toEqual(["begin", "lock"]);
  });

  it("requires persisted reservation evidence", async () => {
    const { uow } = makeUow({ ...base, currentState: "ACTIVE" });
    await expect(
      reserveProperty(uow, context, {
        propertyId: base.id,
        expectedVersion: 1n,
        reasonCode: null,
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_VALIDATION_FAILED" });
  });

  it("restores only to DRAFT and records every derived effect atomically", async () => {
    const { uow, calls } = makeUow({
      ...base,
      currentState: "ARCHIVED",
      deletedAt: new Date("2026-08-01T00:00:00Z"),
    });
    await restoreProperty(uow, context, {
      propertyId: base.id,
      expectedVersion: 1n,
      reasonCode: "ADMIN_RESTORE",
    });
    expect(calls).toEqual([
      "begin",
      "lock",
      "property",
      "state-history",
      "audit",
      "outbox",
      "commit",
    ]);
  });

  it("soft deletes without inventing a lifecycle transition", async () => {
    const { uow, calls } = makeUow({ ...base, currentState: "DRAFT" });
    await softDeleteProperty(uow, context, {
      propertyId: base.id,
      expectedVersion: 1n,
      reasonCode: "ADMIN_DELETE",
    });
    expect(calls).toEqual([
      "begin",
      "lock",
      "property",
      "audit",
      "outbox",
      "commit",
    ]);
  });
});
