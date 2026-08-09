import "server-only";

import { authenticateStaffSession } from "@/application/auth/authenticate-staff-session";
import { PostgresStaffIdentityResolver } from "@/infrastructure/auth/postgres-staff-identity-resolver.server";
import { createSupabaseAuthVerifier } from "@/infrastructure/supabase/auth-verifier";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";

export async function requireStaffPrincipal() {
  const client = await createServerSupabaseClient();
  return authenticateStaffSession(
    createSupabaseAuthVerifier(client),
    new PostgresStaffIdentityResolver(),
  );
}
