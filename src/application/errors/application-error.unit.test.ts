import { describe, expect, it } from "vitest";

import {
  ApplicationError,
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
});
