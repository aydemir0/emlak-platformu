import { z } from "zod";

import { parsePublicEnv } from "@/config/env.client";

const serviceRoleSchema = z.string().min(20);

export type ServerEnv = ReturnType<typeof parseServerEnv>;

export function parseServerEnv(values: Record<string, string | undefined>) {
  return {
    ...parsePublicEnv(values),
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSchema.parse(
      values.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}
