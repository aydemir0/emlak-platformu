import { describe, expect, it } from "vitest";

import {
  createStructuredLogger,
  type LogRecord,
} from "@/application/observability/logger";

describe("structured logger", () => {
  it("redacts credential-like fields before passing a record to an adapter", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger((record) => records.push(record));

    logger.info("request.completed", {
      correlationId: "c5f46686-4882-4dc3-8df8-ed2d5ef4054c",
      authorization: "Bearer secret",
      nested: { token: "secret-token", outcome: "ok" },
    });

    expect(records[0]).toMatchObject({
      level: "info",
      event: "request.completed",
      data: {
        authorization: "[REDACTED]",
        nested: { token: "[REDACTED]", outcome: "ok" },
      },
    });
  });
});
