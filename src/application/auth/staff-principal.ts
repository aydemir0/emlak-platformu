import { z } from "zod";

import { ApplicationError } from "@/application/errors/application-error";

const staffPrincipalSchema = z.object({
  authUserId: z.uuid(),
  identityId: z.uuid(),
  role: z.enum(["ADMIN", "ADVISOR"]),
  aal: z.enum(["aal1", "aal2"]),
});

export type StaffPrincipal = z.infer<typeof staffPrincipalSchema>;

export function createStaffPrincipal(input: unknown): StaffPrincipal {
  const principal = staffPrincipalSchema.parse(input);
  if (principal.role === "ADMIN" && principal.aal !== "aal2") {
    throw new ApplicationError("MFA_REQUIRED", "ADMIN requires AAL2");
  }
  return principal;
}
