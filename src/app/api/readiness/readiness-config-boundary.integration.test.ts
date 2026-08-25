import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { poolConstructor, query } = vi.hoisted(() => ({
  poolConstructor: vi.fn(),
  query: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(configuration: unknown) {
      poolConstructor(configuration);
    }
    query = query;
  },
}));

const productionValues = {
  APP_ENV: "production",
  APP_BASE_URL: "https://emlak.example.test",
  APP_RELEASE: "release-42",
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "remote-public-anon-key-for-tests",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
  LEAD_INTAKE_HMAC_SECRET:
    "lead-intake-test-secret-with-at-least-32-characters",
  CRON_SECRET: "y".repeat(40),
  DATABASE_URL:
    "postgresql://app_user:database-password@db.internal:5432/app?sslmode=require",
};

describe("production readiness configuration boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(productionValues))
      vi.stubEnv(key, value);
    for (const key of [
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ])
      vi.stubEnv(key, undefined);
    query.mockResolvedValue({ rows: [{ ready: 1 }] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("reaches SELECT 1 without non-critical R2 configuration", async () => {
    const { GET } = await import("@/app/api/readiness/route");

    const response = await GET(
      new Request("https://emlak.example.test/api/readiness"),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith({
      text: "SELECT 1",
      query_timeout: 1_000,
    });
    expect(poolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: productionValues.DATABASE_URL,
      }),
    );
  });
});
