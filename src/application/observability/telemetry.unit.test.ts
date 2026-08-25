import { describe, expect, it, vi } from "vitest";

import { createTelemetry } from "@/application/observability/telemetry";

describe("telemetry boundary", () => {
  it.each(["local", "test"] as const)(
    "does not deliver externally in %s",
    (appEnv) => {
      const send = vi.fn();
      const telemetry = createTelemetry({
        appEnv,
        appRelease: appEnv,
        send,
      });

      telemetry.captureException(new Error("database password=not-safe"), {
        correlationId: "5db35779-4638-4da7-b06d-f60821b76355",
        operation: "lead.create",
      });

      expect(send).not.toHaveBeenCalled();
    },
  );

  it("delivers only a sanitized production diagnostic through an injected transport", () => {
    const send = vi.fn();
    const telemetry = createTelemetry({
      appEnv: "production",
      appRelease: "release-20260822",
      send,
    });

    telemetry.captureException(
      new Error("postgres://user:password@db.internal/app"),
      {
        correlationId: "5db35779-4638-4da7-b06d-f60821b76355",
        operation: "lead.create",
      },
    );

    expect(send).toHaveBeenCalledWith({
      event: "error.unexpected",
      appEnv: "production",
      appRelease: "release-20260822",
      correlationId: "5db35779-4638-4da7-b06d-f60821b76355",
      operation: "lead.create",
      errorCode: "INTERNAL",
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("password");
  });
});
