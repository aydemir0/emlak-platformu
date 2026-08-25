import { describe, expect, it } from "vitest";

import {
  createStructuredLogger,
  type LogRecord,
} from "@/application/observability/logger";

describe("structured logger", () => {
  it("adds canonical runtime identity and redacts nested secrets, PII, and raw payloads", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      appEnv: "preview",
      appRelease: "release-20260822",
      sink: (record) => records.push(record),
    });

    logger.info("request.completed", {
      correlationId: "c5f46686-4882-4dc3-8df8-ed2d5ef4054c",
      operation: "lead.create",
      errorCode: "DEPENDENCY_UNAVAILABLE",
      authorization: "Bearer secret",
      email: "person@example.test",
      phone: "+905551112233",
      databaseUrl: "postgresql://user:password@db.internal/app",
      payload: { message: "customer free-form content" },
      providerResponse: { body: { refreshToken: "secret-token" } },
      opaque: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
      metadata: ["api-token-without-a-sensitive-key"],
      nested: {
        token: "secret-token",
        note: "customer free-form content",
        outcome: "ok",
      },
    });

    expect(records[0]).toMatchObject({
      level: "info",
      event: "request.completed",
      correlationId: "c5f46686-4882-4dc3-8df8-ed2d5ef4054c",
      appEnv: "preview",
      appRelease: "release-20260822",
      operation: "lead.create",
      errorCode: "DEPENDENCY_UNAVAILABLE",
      data: {
        authorization: "[REDACTED]",
        email: "[REDACTED]",
        phone: "[REDACTED]",
        databaseUrl: "[REDACTED]",
        payload: "[REDACTED]",
        providerResponse: "[REDACTED]",
        opaque: "[REDACTED]",
        metadata: ["[REDACTED]"],
        nested: {
          token: "[REDACTED]",
          note: "[REDACTED]",
          outcome: "ok",
        },
      },
    });
  });

  it.each([".leading", "trailing."])(
    "drops a non-canonical correlation identifier with %s punctuation",
    (correlationId) => {
      const records: LogRecord[] = [];
      const logger = createStructuredLogger({
        appEnv: "preview",
        appRelease: "release-20260822",
        sink: (record) => records.push(record),
      });

      logger.info("request.completed", { correlationId });

      expect(records[0]).not.toHaveProperty("correlationId");
    },
  );

  it("redacts JWT and API-token-shaped values even under allowlisted operation keys", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      appEnv: "preview",
      appRelease: "release-20260822",
      sink: (record) => records.push(record),
    });

    logger.info("request.completed", {
      outcome: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
      status: "api-live-0123456789abcdef",
    });

    expect(records[0]?.data).toEqual({
      outcome: "[REDACTED]",
      status: "[REDACTED]",
    });
  });

  it.each([
    ["outcome", "synthetic-api-key-redaction-fixture"],
    ["status", "synthetic-secret-redaction-fixture"],
    ["phase", "AKIAIOSFODNN7EXAMPLE"],
  ])("redacts common credential-shaped %s values", (key, value) => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      appEnv: "preview",
      appRelease: "release-20260822",
      sink: (record) => records.push(record),
    });

    logger.info("request.completed", { [key]: value });

    expect(records[0]?.data).toEqual({ [key]: "[REDACTED]" });
  });
});
