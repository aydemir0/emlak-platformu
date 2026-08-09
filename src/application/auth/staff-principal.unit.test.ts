import { describe, expect, it } from "vitest";

import { createStaffPrincipal } from "@/application/auth/staff-principal";

describe("staff principal", () => {
  it("accepts the locked V1 staff roles", () => {
    expect(
      createStaffPrincipal({
        authUserId: "cd6a0686-e8fb-4020-bd3e-7bf3bb96c425",
        identityId: "0e0a8a18-85ca-43d2-9bbf-9127ad2083ee",
        role: "ADVISOR",
        aal: "aal1",
      }),
    ).toMatchObject({ role: "ADVISOR", aal: "aal1" });
  });

  it("rejects an ADMIN principal without AAL2", () => {
    expect(() =>
      createStaffPrincipal({
        authUserId: "cd6a0686-e8fb-4020-bd3e-7bf3bb96c425",
        identityId: "0e0a8a18-85ca-43d2-9bbf-9127ad2083ee",
        role: "ADMIN",
        aal: "aal1",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "MFA_REQUIRED",
        message: expect.stringContaining("AAL2"),
      }),
    );
  });
});
