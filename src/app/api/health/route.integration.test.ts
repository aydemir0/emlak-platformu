import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDatabasePool, getRuntimeIdentity } = vi.hoisted(() => ({
  getDatabasePool: vi.fn(),
  getRuntimeIdentity: vi.fn(),
}));

vi.mock("@/config/env.server.runtime", () => ({ getRuntimeIdentity }));
vi.mock("@/infrastructure/postgres/pool.server", () => ({ getDatabasePool }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "test",
      APP_RELEASE: "release-20260822",
    });
  });

  it("returns minimal liveness identity without touching the database", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({
      status: "ok",
      environment: "test",
      release: "release-20260822",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /secret|service.role|supabase|database|host/i,
    );
    expect(getDatabasePool).not.toHaveBeenCalled();
  });

  it("propagates only valid incoming request context through the delivery response", async () => {
    const response = await GET(
      new Request("http://localhost/api/health", {
        headers: {
          "x-correlation-id": "edge_request-42.prod",
          "x-request-id": "request_42",
        },
      }),
    );

    expect(response.headers.get("x-correlation-id")).toBe(
      "edge_request-42.prod",
    );
    expect(response.headers.get("x-request-id")).toBe("request_42");
  });

  it("remains live without disclosing an invalid runtime identity", async () => {
    getRuntimeIdentity.mockImplementationOnce(() => {
      throw new Error("APP_RELEASE contained secret-host.internal");
    });

    const response = await GET(new Request("http://localhost/api/health"));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).toBe('{"status":"ok"}');
    expect(serialized).not.toMatch(/secret|internal|release|environment/i);
    expect(getDatabasePool).not.toHaveBeenCalled();
  });
});
