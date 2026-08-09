import { describe, expect, it } from "vitest";

import { authenticateStaffSession } from "@/application/auth/authenticate-staff-session";
import { ApplicationError } from "@/application/errors/application-error";

describe("authenticateStaffSession", () => {
  it("fails closed when verified claims are absent", async () => {
    await expect(
      authenticateStaffSession(
        { getVerifiedIdentity: async () => null },
        { findActiveStaff: async () => null },
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<ApplicationError>);
  });

  it("maps verified auth identity through trusted staff records", async () => {
    const principal = await authenticateStaffSession(
      {
        getVerifiedIdentity: async () => ({
          authUserId: "d20e99b2-d388-4fa9-9db2-cc3a1f8c6b15",
          aal: "aal1",
        }),
      },
      {
        findActiveStaff: async () => ({
          identityId: "295c4ee9-53be-4758-94b5-e0403c589c85",
          role: "ADVISOR",
        }),
      },
    );

    expect(principal).toEqual({
      authUserId: "d20e99b2-d388-4fa9-9db2-cc3a1f8c6b15",
      identityId: "295c4ee9-53be-4758-94b5-e0403c589c85",
      role: "ADVISOR",
      aal: "aal1",
    });
  });
});
