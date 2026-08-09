import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/application/errors/application-error";

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi
    .fn()
    .mockRejectedValue(
      new ApplicationError("UNAUTHENTICATED", "Authentication required"),
    ),
}));

import { POST } from "@/app/api/admin/properties/[propertyId]/media/uploads/route";

const propertyId = "11111111-1111-4111-8111-111111111111";

describe("media upload route boundary", () => {
  it("returns 401 before constructing storage/database access for an unauthenticated request", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          declaredMimeType: "image/jpeg",
          byteSize: 100,
          idempotencyKey: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      { params: Promise.resolve({ propertyId }) },
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
    });
  });

  it("rejects unknown fields and unsupported formats with a stable 422 response", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          declaredMimeType: "image/svg+xml",
          byteSize: 100,
          idempotencyKey: "22222222-2222-4222-8222-222222222222",
          objectKey: "attacker",
        }),
      }),
      { params: Promise.resolve({ propertyId }) },
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MEDIA_VALIDATION_FAILED" },
    });
  });
});
