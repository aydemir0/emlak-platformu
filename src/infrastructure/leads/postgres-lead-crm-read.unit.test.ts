import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PostgresLeadCrmReadRepository } from "@/infrastructure/leads/postgres-lead-crm.server";
describe("lead CRM list read model", () => {
  it("loads a page and total in one bounded query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repo = new PostgresLeadCrmReadRepository({ query } as never);
    await repo.list(
      {
        identityId: "10000000-0000-4000-8000-000000000001",
        authUserId: "20000000-0000-4000-8000-000000000001",
        role: "ADMIN",
        aal: "aal2",
      },
      { limit: 25, offset: 0 },
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
