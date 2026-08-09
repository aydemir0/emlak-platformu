import "server-only";

import { createSupabaseAuthVerifier } from "@/infrastructure/supabase/auth-verifier";
import { createServerSupabaseClient } from "@/infrastructure/supabase/server";

export async function getVerifiedAuthIdentity() {
  const client = await createServerSupabaseClient();
  return createSupabaseAuthVerifier(client).getVerifiedIdentity();
}
