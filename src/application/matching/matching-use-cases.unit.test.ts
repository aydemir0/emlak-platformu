import { describe, expect, it, vi } from "vitest";

import { refreshCustomerRequestMatches } from "@/application/matching/matching-use-cases";

const profile = {
  requestId: "request-1",
  customerId: "customer-1",
  version: 1n,
  profile: {
    listingTypeId: "sale",
    location: { mode: "MISSING" as const },
    budget: { mode: "MISSING" as const },
    propertyTypes: { mode: "MISSING" as const },
    rooms: { mode: "MISSING" as const },
    netAreaDeciSqm: { mode: "MISSING" as const },
    features: { mode: "MISSING" as const },
  },
};
const context = {
  actor: {
    identityId: "identity",
    authUserId: "auth",
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: "correlation",
  requestId: "request",
};

describe("matching application service", () => {
  it.each([501, Number.MAX_SAFE_INTEGER])(
    "rejects candidate limit %s before opening a transaction",
    async (candidateLimit) => {
      const transaction = vi.fn();

      await expect(
        refreshCustomerRequestMatches({ transaction }, context, {
          customerRequestId: "request-1",
          candidateLimit,
        }),
      ).rejects.toMatchObject({ code: "MATCHING_INPUT_INVALID" });

      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("returns a PII-free, deterministic sorted projection", async () => {
    let persisted = false;
    const result = await refreshCustomerRequestMatches(
      {
        transaction: async (work) =>
          work({
            loadAuthorizedProfile: async () => profile,
            loadCandidates: async () => [
              { id: "b", version: 1n, listingTypeId: "sale", featureIds: [] },
              { id: "a", version: 1n, listingTypeId: "sale", featureIds: [] },
            ],
            loadCurrentMatches: async () => [],
            persistGeneration: async () => {
              persisted = true;
            },
          }),
      },
      context,
      { customerRequestId: "request-1", candidateLimit: 2 },
    );
    expect(result.map((item) => item.propertyId)).toEqual(["a", "b"]);
    expect(result[0]).not.toHaveProperty("customerId");
    expect(persisted).toBe(true);
  });

  it("detects overflow before any persistence", async () => {
    let persisted = false;
    await expect(
      refreshCustomerRequestMatches(
        {
          transaction: async (work) =>
            work({
              loadAuthorizedProfile: async () => profile,
              loadCandidates: async () => [
                { id: "a", version: 1n, listingTypeId: "sale", featureIds: [] },
                { id: "b", version: 1n, listingTypeId: "sale", featureIds: [] },
              ],
              loadCurrentMatches: async () => [],
              persistGeneration: async () => {
                persisted = true;
              },
            }),
        },
        context,
        { customerRequestId: "request-1", candidateLimit: 1 },
      ),
    ).rejects.toMatchObject({ code: "MATCHING_CANDIDATE_LIMIT_EXCEEDED" });
    expect(persisted).toBe(false);
  });

  it("does not rewrite an identical persisted generation", async () => {
    let persisted = false;
    const candidate = {
      id: "a",
      version: 1n,
      listingTypeId: "sale",
      featureIds: [] as string[],
    };
    const result = await refreshCustomerRequestMatches(
      {
        transaction: async (work) =>
          work({
            loadAuthorizedProfile: async () => profile,
            loadCandidates: async () => [candidate],
            loadCurrentMatches: async () => {
              const crypto =
                await import("@/domain/matching/matching-engine-v2");
              return [
                {
                  propertyId: "a",
                  propertyVersion: 1n,
                  fingerprint: crypto.matchingFingerprintV2(
                    profile.profile,
                    candidate,
                  ),
                },
              ];
            },
            persistGeneration: async () => {
              persisted = true;
            },
          }),
      },
      context,
      { customerRequestId: "request-1", candidateLimit: 1 },
    );
    expect(result).toHaveLength(1);
    expect(persisted).toBe(false);
  });
});
