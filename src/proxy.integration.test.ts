import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeEnvironment = vi.hoisted(() => ({
  r2: null as { accountId: string; bucketName: string } | null,
}));
const { getServerEnv } = vi.hoisted(() => ({
  getServerEnv: vi.fn(() => ({ R2: runtimeEnvironment.r2 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/proxy", () => ({
  refreshStaffSession: async () => NextResponse.next(),
}));
vi.mock("@/config/env.server.runtime", () => ({
  getServerEnv,
}));

import * as proxyModule from "./proxy";

describe("browser security proxy", () => {
  beforeEach(() => {
    getServerEnv.mockReset();
    getServerEnv.mockImplementation(() => ({ R2: runtimeEnvironment.r2 }));
  });

  it.each(["/api/health", "/api/readiness"])(
    "keeps %s independent from unrelated server configuration",
    async (pathname) => {
      getServerEnv.mockImplementationOnce(() => {
        throw new Error("R2 configuration is required in production");
      });

      const response = await proxyModule.proxy(
        new NextRequest(`https://emlak.example.test${pathname}`),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "connect-src 'self'",
      );
      expect(getServerEnv).not.toHaveBeenCalled();
    },
  );

  it("allows the exact R2 origin used by a presigned browser upload", async () => {
    runtimeEnvironment.r2 = {
      accountId: "production-account-id",
      bucketName: "production-media-bucket",
    };

    const response = await proxyModule.proxy(
      new NextRequest("https://emlak.example.test/admin/properties/example"),
    );
    const policy = response.headers.get("Content-Security-Policy") ?? "";

    expect(policy).toContain(
      "connect-src 'self' https://production-media-bucket.production-account-id.r2.cloudflarestorage.com",
    );
  });

  it("binds a per-request nonce into the browser CSP without unsafe scripts", async () => {
    runtimeEnvironment.r2 = null;
    const response = await proxyModule.proxy(
      new NextRequest("https://emlak.example.test/"),
    );
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    const scriptSource = policy
      .split("; ")
      .find((directive) => directive.startsWith("script-src"));

    expect(scriptSource).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(scriptSource).not.toContain("unsafe-inline");
    expect(scriptSource).not.toContain("unsafe-eval");
    expect(policy).toContain("connect-src 'self'");
  });

  it("uses Next's canonical config matcher without intercepting static assets", () => {
    expect("config" in proxyModule).toBe(true);
    if (!("config" in proxyModule)) return;

    expect(
      unstable_doesMiddlewareMatch({
        config: proxyModule.config,
        url: "https://emlak.example.test/admin",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyModule.config,
        url: "https://emlak.example.test/_next/static/chunk.js",
      }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyModule.config,
        url: "https://emlak.example.test/_next/image?url=%2Fimage.jpg",
      }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyModule.config,
        url: "https://emlak.example.test/favicon.ico",
      }),
    ).toBe(false);
  });

  it("disables frame embedding and avoids unused image and font sources", async () => {
    runtimeEnvironment.r2 = null;
    const response = await proxyModule.proxy(
      new NextRequest("https://emlak.example.test/"),
    );
    const policy = response.headers.get("Content-Security-Policy") ?? "";

    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("img-src 'self'");
    expect(policy).not.toContain("img-src 'self' data: blob:");
    expect(policy).not.toContain("font-src");
  });
});
