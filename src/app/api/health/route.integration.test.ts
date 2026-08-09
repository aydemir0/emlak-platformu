import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a non-sensitive readiness envelope and correlation header", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({ status: "ok", checks: { application: "ready" } });
    expect(JSON.stringify(body)).not.toMatch(/secret|service.role|supabase/i);
  });
});
