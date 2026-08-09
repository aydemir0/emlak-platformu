import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv, type PublicEnv } from "@/config/env.client";
import type { Database } from "@/types/database.generated";

export function createBrowserSupabaseClient(env: PublicEnv = getPublicEnv()) {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
