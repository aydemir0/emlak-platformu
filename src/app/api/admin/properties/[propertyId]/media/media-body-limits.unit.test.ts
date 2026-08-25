import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/auth/require-staff-principal.server", () => ({
  requireStaffPrincipal: vi.fn(),
}));

import { POST as command } from "@/app/api/admin/properties/[propertyId]/media/route";
import { POST as finalize } from "@/app/api/admin/properties/[propertyId]/media/uploads/[sessionId]/finalize/route";
import {
  MEDIA_COMMAND_MAX_BYTES,
  MEDIA_UPLOAD_METADATA_MAX_BYTES,
} from "@/features/property-media/media-delivery.server";

const propertyId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

describe("media route body limits", () => {
  it("bounds finalize metadata at the shared upload metadata ceiling", async () => {
    const response = await finalize(
      new Request("http://localhost/finalize", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "33333333-3333-4333-8333-333333333333",
          padding: "x".repeat(MEDIA_UPLOAD_METADATA_MAX_BYTES),
        }),
      }),
      { params: Promise.resolve({ propertyId, sessionId }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MEDIA_REQUEST_TOO_LARGE" },
    });
  });

  it("bounds media commands at the shared 128 KiB ceiling", async () => {
    const response = await command(
      new Request("http://localhost/media", {
        method: "POST",
        body: JSON.stringify({
          command: "retry",
          idempotencyKey: "33333333-3333-4333-8333-333333333333",
          padding: "x".repeat(MEDIA_COMMAND_MAX_BYTES),
        }),
      }),
      { params: Promise.resolve({ propertyId }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MEDIA_REQUEST_TOO_LARGE" },
    });
  });
});
