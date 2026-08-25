import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getDatabasePool, getServerReadinessEnv, query } = vi.hoisted(() => ({
  getDatabasePool: vi.fn(),
  getServerReadinessEnv: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/config/env.server.runtime", () => ({ getServerReadinessEnv }));
vi.mock("@/infrastructure/postgres/pool.server", () => ({ getDatabasePool }));

async function loadGet() {
  return (await import("@/app/api/readiness/route")).GET;
}

describe("GET /api/readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerReadinessEnv.mockReturnValue({ DATABASE_URL: "[redacted]" });
    getDatabasePool.mockReturnValue({ query });
    query.mockResolvedValue({ rows: [{ ready: 1 }] });
  });

  it("uses a bounded SELECT 1 and returns a minimal ready response", async () => {
    const GET = await loadGet();
    const response = await GET(
      new Request("http://localhost/api/readiness", {
        headers: { "x-correlation-id": "edge_request-42.prod" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-correlation-id")).toBe(
      "edge_request-42.prod",
    );
    expect(await response.json()).toEqual({
      status: "ready",
      checks: { configuration: "ready", database: "ready" },
    });
    expect(query).toHaveBeenCalledWith({
      text: "SELECT 1",
      query_timeout: 1_000,
    });
  });

  it("maps a database failure to a safe unavailable response", async () => {
    query.mockRejectedValueOnce(
      new Error("postgres://user:password@db.internal/app"),
    );
    const GET = await loadGet();
    const response = await GET(new Request("http://localhost/api/readiness"));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      '{"status":"unavailable","checks":{"configuration":"ready","database":"unavailable"}}',
    );
    expect(serialized).not.toMatch(/password|postgres|internal|host|error/i);
  });

  it("bounds a database check that never settles", async () => {
    vi.useFakeTimers();
    try {
      query.mockReturnValueOnce(new Promise(() => {}));
      const GET = await loadGet();
      const responsePromise = GET(
        new Request("http://localhost/api/readiness"),
      );

      await vi.advanceTimersByTimeAsync(1_000);

      const response = await responsePromise;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "unavailable",
        checks: { configuration: "ready", database: "unavailable" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces repeated public timeouts into one in-flight database probe", async () => {
    vi.useFakeTimers();
    try {
      query.mockReturnValue(new Promise(() => {}));
      const GET = await loadGet();

      const responses = [1, 2, 3].map(() =>
        GET(new Request("http://localhost/api/readiness")),
      );
      await vi.advanceTimersByTimeAsync(1_000);

      const values = await Promise.all(responses);
      expect(values.map((response) => response.status)).toEqual([
        503, 503, 503,
      ]);
      expect(query).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails safely before database access when canonical config is invalid", async () => {
    getServerReadinessEnv.mockImplementationOnce(() => {
      throw new Error("DATABASE_URL includes db.internal");
    });
    const GET = await loadGet();
    const response = await GET(new Request("http://localhost/api/readiness"));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      '{"status":"unavailable","checks":{"configuration":"unavailable","database":"unavailable"}}',
    );
    expect(serialized).not.toMatch(/database_url|internal|error/i);
    expect(getDatabasePool).not.toHaveBeenCalled();
  });
});
