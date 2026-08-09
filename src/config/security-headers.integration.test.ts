import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("framework security headers", () => {
  it("protects every route with the approved baseline", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(
      rules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );

    expect(rules?.[0]?.source).toBe("/(.*)");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
