import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/config/env.server.runtime";
import type { Database } from "@/types/database.generated";

export function createPrivilegedSupabaseClient() {
  const env = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
