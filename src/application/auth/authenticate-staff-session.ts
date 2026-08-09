import { ApplicationError } from "@/application/errors/application-error";
import {
  createStaffPrincipal,
  type StaffPrincipal,
} from "@/application/auth/staff-principal";

export type VerifiedAuthIdentity = Readonly<{
  authUserId: string;
  aal: "aal1" | "aal2";
}>;

export interface AuthVerifier {
  getVerifiedIdentity(): Promise<VerifiedAuthIdentity | null>;
}

export interface StaffIdentityResolver {
  findActiveStaff(
    authUserId: string,
  ): Promise<Pick<StaffPrincipal, "identityId" | "role"> | null>;
}

export async function authenticateStaffSession(
  authVerifier: AuthVerifier,
  staffResolver: StaffIdentityResolver,
): Promise<StaffPrincipal> {
  const identity = await authVerifier.getVerifiedIdentity();
  if (!identity) {
    throw new ApplicationError("UNAUTHENTICATED", "Authentication required");
  }

  const staff = await staffResolver.findActiveStaff(identity.authUserId);
  if (!staff) {
    throw new ApplicationError("FORBIDDEN", "Active staff access required");
  }

  return createStaffPrincipal({ ...identity, ...staff });
}
