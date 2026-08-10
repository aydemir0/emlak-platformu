import "server-only";

import { parseServerEnv } from "@/config/env.server";

export function getServerEnv() {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LEAD_INTAKE_HMAC_SECRET: process.env.LEAD_INTAKE_HMAC_SECRET,
    LEAD_RATE_LIMIT_MAX_ATTEMPTS: process.env.LEAD_RATE_LIMIT_MAX_ATTEMPTS,
    LEAD_RATE_LIMIT_WINDOW_SECONDS: process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS,
    LOCAL_DATABASE_URL: process.env.LOCAL_DATABASE_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  });
}
