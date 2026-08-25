import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";
import type { LogRecord } from "@/application/observability/logger";

vi.mock("server-only", () => ({}));

const { getRuntimeIdentity } = vi.hoisted(() => ({
  getRuntimeIdentity: vi.fn(),
}));

vi.mock("@/config/env.server.runtime", () => ({ getRuntimeIdentity }));

import {
  createRuntimeObservability,
  reportUnexpectedError,
} from "@/infrastructure/observability/runtime-observability.server";

describe("runtime observability", () => {
  it("uses parsed runtime identity for sanitized unexpected-error logging", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "preview",
      APP_RELEASE: "release-20260822",
    });
    const records: unknown[] = [];

    createRuntimeObservability({
      sink: (record) => records.push(record),
    }).reportUnexpectedError(
      new Error("postgres://user:password@db.internal/app"),
      {
        correlationId: "edge_request-42.prod",
        operation: "lead.convert",
      },
    );

    expect(records).toEqual([
      expect.objectContaining({
        event: "operation.failed",
        appEnv: "preview",
        appRelease: "release-20260822",
        correlationId: "edge_request-42.prod",
        operation: "lead.convert",
        errorCode: "INTERNAL",
        data: {},
      }),
    ]);
    expect(JSON.stringify(records)).not.toContain("password");
  });

  it("retains a typed dependency failure code without exposing its cause", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "preview",
      APP_RELEASE: "release-20260822",
    });
    const records: LogRecord[] = [];

    createRuntimeObservability({
      sink: (record) => records.push(record),
    }).reportUnexpectedError(
      new ApplicationError(
        "MEDIA_STORAGE_UNAVAILABLE",
        "provider response with secret",
      ),
      {
        correlationId: "edge_request-42.prod",
        operation: "media.upload.initialize",
      },
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      correlationId: "edge_request-42.prod",
      operation: "media.upload.initialize",
      errorCode: "MEDIA_STORAGE_UNAVAILABLE",
      data: {},
    });
    expect(JSON.stringify(records)).not.toContain("provider response");
  });

  it("does not let a failing sink escape the best-effort reporter", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "preview",
      APP_RELEASE: "release-20260822",
    });

    expect(() =>
      createRuntimeObservability({
        sink: () => {
          throw new Error("sink unavailable");
        },
      }).reportUnexpectedError(new Error("database unavailable"), {
        operation: "property.update",
      }),
    ).not.toThrow();
  });

  it("uses the same parsed runtime identity through the production helper", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "test",
      APP_RELEASE: "test-release",
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    reportUnexpectedError(new Error("unexpected"), {
      operation: "lead.convert",
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"appRelease":"test-release"'),
    );
    consoleError.mockRestore();
  });

  it("logs only a PII-free structured worker run with canonical identity", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "production",
      APP_RELEASE: "release-20260822",
    });
    const records: unknown[] = [];

    createRuntimeObservability({
      sink: (record) => records.push(record),
    }).reportWorkerRun({
      operation: "lead.outbox",
      correlationId: "lead-worker-run-1",
      claimed: 3,
      succeeded: 1,
      retried: 1,
      deadLettered: 1,
      staleRecovered: 1,
      durationMs: 42,
      failureCategories: {
        application: 0,
        dependency: 1,
        storage: 0,
        validation: 1,
      },
    });

    expect(records).toEqual([
      expect.objectContaining({
        event: "worker.run.completed",
        correlationId: "lead-worker-run-1",
        operation: "lead.outbox",
        appEnv: "production",
        appRelease: "release-20260822",
        data: {
          kind: "worker",
          phase: "completed",
          outcome: "failed",
          claimed: 3,
          succeeded: 1,
          retried: 1,
          deadLettered: 1,
          staleRecovered: 1,
          durationMs: 42,
          failureCategories: {
            application: 0,
            dependency: 1,
            storage: 0,
            validation: 1,
          },
        },
      }),
    ]);
    expect(JSON.stringify(records)).not.toMatch(/email|payload|customer/i);
  });

  it("marks a dependency-category run as failed without inventing a retry", () => {
    getRuntimeIdentity.mockReturnValue({
      APP_ENV: "preview",
      APP_RELEASE: "release-20260822",
    });
    const records: LogRecord[] = [];

    createRuntimeObservability({
      sink: (record) => records.push(record),
    }).reportWorkerRun({
      operation: "lead.outbox",
      correlationId: "lead-worker-run-claim-failure",
      claimed: 0,
      succeeded: 0,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      durationMs: 2,
      failureCategories: {
        application: 0,
        dependency: 1,
        storage: 0,
        validation: 0,
      },
    });

    expect(records[0]?.data).toMatchObject({ outcome: "failed", retried: 0 });
  });
});
