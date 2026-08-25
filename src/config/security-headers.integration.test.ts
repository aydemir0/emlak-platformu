import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../next.config";

describe("framework security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("explicitly bounds Server Action request bodies", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("64kb");
  });

  it("emits HSTS only for the HTTPS production deployment", async () => {
    vi.stubEnv("APP_ENV", "production");
    const productionRules = await nextConfig.headers?.();
    const productionHeaders = new Map(
      productionRules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );

    expect(productionHeaders.get("Strict-Transport-Security")).toBe(
      "max-age=63072000",
    );

    vi.stubEnv("APP_ENV", "test");
    const testRules = await nextConfig.headers?.();
    const testHeaders = new Map(
      testRules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );

    expect(testHeaders.has("Strict-Transport-Security")).toBe(false);
  });

  it("does not permit inline scripts or arbitrary remote connections", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(
      rules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );
    const csp = headers.get("Content-Security-Policy") ?? "";

    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("connect-src 'self' https: wss:");
  });

  it("keeps the static fallback free of unused image, font, and frame sources", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(
      rules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );
    const csp = headers.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("img-src 'self'");
    expect(csp).not.toContain("img-src 'self' data: blob:");
    expect(csp).not.toContain("font-src");
  });
});
