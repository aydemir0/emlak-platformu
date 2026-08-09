import { z } from "zod";

import { parsePublicEnv } from "@/config/env.client";

const serviceRoleSchema = z.string().min(20);

const localDatabaseUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (
      url.protocol !== "postgresql:" ||
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      url.port !== "55322"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "LOCAL_DATABASE_URL must target local emlak-platformu port 55322",
      });
    }
  });

export type ServerEnv = ReturnType<typeof parseServerEnv>;

export function parseServerEnv(values: Record<string, string | undefined>) {
  return {
    ...parsePublicEnv(values),
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSchema.parse(
      values.SUPABASE_SERVICE_ROLE_KEY,
    ),
    LOCAL_DATABASE_URL: localDatabaseUrlSchema.parse(values.LOCAL_DATABASE_URL),
  };
}
