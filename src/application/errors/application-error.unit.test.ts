import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  toErrorDiagnostic,
  toPublicError,
} from "@/application/errors/application-error";

describe("application errors", () => {
  it("maps a stable typed error without leaking its cause", () => {
    const error = new ApplicationError(
      "UNAUTHENTICATED",
      "Authentication required",
      {
        cause: new Error("provider token detail"),
        correlationId: "5db35779-4638-4da7-b06d-f60821b76355",
      },
    );

    expect(toPublicError(error)).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      correlationId: "5db35779-4638-4da7-b06d-f60821b76355",
    });
    expect(JSON.stringify(toPublicError(error))).not.toContain(
      "provider token detail",
    );
  });

  it("maps an unexpected error to a generic outward error and a sanitized diagnostic", () => {
    const correlationId = "5db35779-4638-4da7-b06d-f60821b76355";
    const error = new Error(
      "password=not-safe postgres://user:password@db.internal/app",
    );

    expect(toPublicError(error, correlationId)).toEqual({
      code: "INTERNAL",
      message: "Operation could not be completed",
      correlationId,
    });
    expect(
      toErrorDiagnostic(error, { correlationId, operation: "lead.create" }),
    ).toEqual({
      code: "INTERNAL",
      correlationId,
      operation: "lead.create",
    });
  });

  it("drops malformed correlation and free-form operation context from diagnostics", () => {
    expect(
      toErrorDiagnostic(new Error("unexpected"), {
        correlationId: ".not-canonical",
        operation: "customer supplied free-form text",
      }),
    ).toEqual({ code: "INTERNAL" });
  });
});
