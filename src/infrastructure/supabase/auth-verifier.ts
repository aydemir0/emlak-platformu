import { z } from "zod";

import type { AuthVerifier } from "@/application/auth/authenticate-staff-session";

const claimsSchema = z.object({
  sub: z.uuid(),
  aal: z.enum(["aal1", "aal2"]).default("aal1"),
});

type ClaimsClient = {
  auth: {
    getClaims(): Promise<{ data: { claims?: unknown } | null; error: unknown }>;
  };
};

export function createSupabaseAuthVerifier(client: ClaimsClient): AuthVerifier {
  return {
    async getVerifiedIdentity() {
      const { data, error } = await client.auth.getClaims();
      if (error || !data?.claims) return null;
      const claims = claimsSchema.safeParse(data.claims);
      return claims.success
        ? { authUserId: claims.data.sub, aal: claims.data.aal }
        : null;
    },
  };
}
