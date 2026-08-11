import { z } from "zod";

import { parsePublicEnv } from "@/config/env.client";

const serviceRoleSchema = z.string().min(20);
const leadHmacSecretSchema = z.string().min(32);
export const MATCHING_CANDIDATE_LIMIT_DEFAULT = 500;
const matchingCandidateLimitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(10_000)
  .default(MATCHING_CANDIDATE_LIMIT_DEFAULT);

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
  const r2Values = [
    values.R2_ACCOUNT_ID,
    values.R2_BUCKET_NAME,
    values.R2_ACCESS_KEY_ID,
    values.R2_SECRET_ACCESS_KEY,
  ];
  const configuredR2Values = r2Values.filter(Boolean);
  if (configuredR2Values.length > 0 && configuredR2Values.length !== 4) {
    throw new Error("R2 configuration must be provided as one complete group");
  }
  return {
    ...parsePublicEnv(values),
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSchema.parse(
      values.SUPABASE_SERVICE_ROLE_KEY,
    ),
    LEAD_INTAKE_HMAC_SECRET: leadHmacSecretSchema.parse(
      values.LEAD_INTAKE_HMAC_SECRET,
    ),
    LEAD_RATE_LIMIT_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(5)
      .parse(values.LEAD_RATE_LIMIT_MAX_ATTEMPTS),
    LEAD_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(86_400)
      .default(900)
      .parse(values.LEAD_RATE_LIMIT_WINDOW_SECONDS),
    MATCHING_CANDIDATE_LIMIT: matchingCandidateLimitSchema.parse(
      values.MATCHING_CANDIDATE_LIMIT,
    ),
    LOCAL_DATABASE_URL: localDatabaseUrlSchema.parse(values.LOCAL_DATABASE_URL),
    R2:
      configuredR2Values.length === 4
        ? {
            accountId: z.string().min(1).parse(values.R2_ACCOUNT_ID),
            bucketName: z.string().min(1).parse(values.R2_BUCKET_NAME),
            accessKeyId: z.string().min(1).parse(values.R2_ACCESS_KEY_ID),
            secretAccessKey: z
              .string()
              .min(1)
              .parse(values.R2_SECRET_ACCESS_KEY),
          }
        : null,
  };
}
