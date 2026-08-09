import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PostgresPropertyReadRepository } from "@/infrastructure/properties/postgres-property-read-repository.server";

describe("property list read model", () => {
  it("loads a paginated list and total count in one query", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          public_id: "P-1",
          title: "Property",
          current_state: "DRAFT",
          listing_type_label: "Satılık",
          property_type_label: "Konut",
          location_name: "İstanbul",
          price_amount_minor: "100",
          currency_code: "TRY",
          version: "1",
          total_count: "26",
          advisor_names: ["Advisor"],
          updated_at: new Date("2026-08-09T12:00:00Z"),
        },
      ],
    });
    const repository = new PostgresPropertyReadRepository({ query } as never);
    const result = await repository.list(
      {
        authUserId: "20000000-0000-4000-8000-000000000001",
        identityId: "30000000-0000-4000-8000-000000000001",
        role: "ADMIN",
        aal: "aal2",
      },
      { limit: 25, offset: 0, sort: "updated_desc" },
    );
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("count(*) over()");
    expect(result).toMatchObject({ total: 26, items: [{ publicId: "P-1" }] });
  });
});
