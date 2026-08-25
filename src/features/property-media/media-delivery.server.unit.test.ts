import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));
const { reportUnexpectedError } = vi.hoisted(() => ({
  reportUnexpectedError: vi.fn(),
}));
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError,
}));

import {
  mediaFailure,
  readBoundedMediaJson,
} from "@/features/property-media/media-delivery.server";

describe("media delivery failures", () => {
  beforeEach(() => {
    reportUnexpectedError.mockClear();
  });

  it("enforces actual streamed bytes when content-length is forged smaller", async () => {
    const request = new Request("http://localhost/media", {
      method: "POST",
      headers: { "content-length": "1" },
      body: JSON.stringify({ padding: "x".repeat(100) }),
    });

    await expect(readBoundedMediaJson(request, 32)).rejects.toMatchObject({
      code: "MEDIA_REQUEST_TOO_LARGE",
    });
  });

  it("accepts a valid JSON body at the exact byte limit", async () => {
    const maximumBytes = 32;
    const body = `null${" ".repeat(maximumBytes - 4)}`;
    const request = new Request("http://localhost/media", {
      method: "POST",
      headers: { "content-length": String(maximumBytes) },
      body,
    });

    await expect(
      readBoundedMediaJson(request, maximumBytes),
    ).resolves.toBeNull();
  });

  it("rejects malformed UTF-8 without replacement decoding", async () => {
    const request = new Request("http://localhost/media", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });

    await expect(readBoundedMediaJson(request, 32)).rejects.toMatchObject({
      code: "MEDIA_VALIDATION_FAILED",
    });
  });

  it("does not disclose whether a direct media id exists", async () => {
    const responses = (["MEDIA_NOT_FOUND", "MEDIA_FORBIDDEN"] as const).map(
      (code) =>
        mediaFailure(new ApplicationError(code, "internal-only detail")),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    await expect(
      Promise.all(responses.map((response) => response.json())),
    ).resolves.toEqual([
      { error: { code: "MEDIA_NOT_FOUND", message: "MEDIA_NOT_FOUND" } },
      { error: { code: "MEDIA_NOT_FOUND", message: "MEDIA_NOT_FOUND" } },
    ]);
    expect(reportUnexpectedError).not.toHaveBeenCalled();
  });

  it("reports a typed storage failure exactly once and keeps the response safe", async () => {
    const error = new ApplicationError(
      "MEDIA_STORAGE_UNAVAILABLE",
      "provider detail",
    );

    const response = mediaFailure(error, {
      correlationId: "edge_request-42.prod",
      operation: "media.upload.initialize",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "MEDIA_STORAGE_UNAVAILABLE",
        message: "MEDIA_STORAGE_UNAVAILABLE",
        correlationId: "edge_request-42.prod",
      },
    });
    expect(reportUnexpectedError).toHaveBeenCalledOnce();
    expect(reportUnexpectedError).toHaveBeenCalledWith(error, {
      correlationId: "edge_request-42.prod",
      operation: "media.upload.initialize",
    });
  });

  it.each([
    "UNAUTHENTICATED",
    "MEDIA_NOT_FOUND",
    "MEDIA_VALIDATION_FAILED",
  ] as const)("does not report expected %s delivery failures", (code) => {
    mediaFailure(new ApplicationError(code, code), {
      correlationId: "edge_request-42.prod",
      operation: "media.command",
    });

    expect(reportUnexpectedError).not.toHaveBeenCalled();
  });
});
