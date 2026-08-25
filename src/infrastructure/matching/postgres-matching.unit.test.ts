import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PostgresMatchingReadRepository,
  PostgresMatchingUnitOfWork,
} from "@/infrastructure/matching/postgres-matching.server";

const actor = {
  identityId: "10000000-0000-4000-8000-000000000001",
  authUserId: "20000000-0000-4000-8000-000000000001",
  role: "ADMIN" as const,
  aal: "aal2" as const,
};

describe("Postgres matching reliability bounds", () => {
  it("rejects an oversized persisted result view instead of loading it unbounded", async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes("from public.customer_requests")) {
        return {
          rows: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              listing_type_label: "Satılık",
              matching_location_state: "MISSING",
              matching_budget_state: "MISSING",
              matching_property_type_state: "MISSING",
              matching_rooms_state: "MISSING",
              matching_net_area_state: "MISSING",
              matching_features_state: "MISSING",
              currency_code: null,
            },
          ],
        };
      }
      if (text.includes("from public.customer_request_features")) {
        return { rows: [] };
      }
      return {
        rows: Array.from({ length: 501 }, (_, index) => ({
          property_id: `property-${index}`,
          status: "STALE",
          score: "0.5",
          title: `Property ${index}`,
          public_id: `PUBLIC-${index}`,
          reasons: [],
        })),
      };
    });
    const repository = new PostgresMatchingReadRepository({ query } as never);

    await expect(
      repository.get(actor, "30000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ code: "MATCHING_RESULT_LIMIT_EXCEEDED" });
  });

  it("persists a generation and all reasons with constant SQL statement count", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (text: string) => {
      statements.push(text);
      if (text.includes("persisted_count")) {
        return { rows: [{ persisted_count: 2 }] };
      }
      if (text.includes("returning id")) {
        return { rows: [{ id: `match-${statements.length}` }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const client = { query, release: vi.fn() };
    const unitOfWork = new PostgresMatchingUnitOfWork({
      connect: async () => client,
    } as never);

    await unitOfWork.transaction((transaction) =>
      transaction.persistGeneration({
        profile: {
          requestId: "30000000-0000-4000-8000-000000000001",
          customerId: "40000000-0000-4000-8000-000000000001",
          version: 4n,
          profile: {
            listingTypeId: "50000000-0000-4000-8000-000000000001",
            location: { mode: "MISSING" },
            budget: { mode: "MISSING" },
            propertyTypes: { mode: "MISSING" },
            rooms: { mode: "MISSING" },
            netAreaDeciSqm: { mode: "MISSING" },
            features: { mode: "MISSING" },
          },
        },
        matches: ["1", "2"].map((suffix) => ({
          status: "MATCHED" as const,
          ruleVersion: "matching-v2" as const,
          propertyId: `${suffix}0000000-0000-4000-8000-000000000001`,
          propertyVersion: 2n,
          fingerprint: suffix.repeat(64),
          totalScore: 80,
          components: {
            location: 30,
            budget: 25,
            propertyType: 15,
            rooms: 10,
            netArea: 0,
            features: 0,
          },
          reasons: [
            {
              component: "location" as const,
              code: "LOCATION_EXACT" as const,
              points: 30,
            },
            {
              component: "budget" as const,
              code: "BUDGET_IN_RANGE" as const,
              points: 25,
            },
          ],
        })),
        correlationId: "60000000-0000-4000-8000-000000000001",
        requestId: "70000000-0000-4000-8000-000000000001",
      }),
    );

    expect(
      statements.filter((text) => text !== "begin" && text !== "commit"),
    ).toHaveLength(2);
  });
});
