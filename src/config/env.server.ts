import { isIP } from "node:net";

import { z } from "zod";

import { parsePublicEnv } from "@/config/env.client";
import { MATCHING_CANDIDATE_LIMIT_MAXIMUM } from "@/domain/matching/matching-policy";

export { MATCHING_CANDIDATE_LIMIT_MAXIMUM } from "@/domain/matching/matching-policy";

const serviceRoleSchema = z.string().min(20);
const leadHmacSecretSchema = z.string().min(32);
const cronSecretSchema = z.string().min(32);
const appEnvironmentSchema = z
  .enum(["local", "test", "preview", "production"])
  .default("local");
const appReleaseSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
export const MATCHING_CANDIDATE_LIMIT_DEFAULT = 500;
const matchingCandidateLimitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MATCHING_CANDIDATE_LIMIT_MAXIMUM)
  .default(MATCHING_CANDIDATE_LIMIT_DEFAULT);

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type RuntimeIdentity = ReturnType<typeof parseRuntimeIdentity>;
export type ServerPublicEnv = ReturnType<typeof parseServerPublicEnv>;
export type DatabaseReadinessEnv = ReturnType<typeof parseDatabaseReadinessEnv>;
export type ServerReadinessEnv = ReturnType<typeof parseServerReadinessEnv>;
export type ServerEnv = ReturnType<typeof parseServerEnv>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const TLS_DATABASE_MODES = new Set(["require", "verify-ca", "verify-full"]);

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }
  if (isIP(normalized) === 4) {
    return normalized.split(".")[0] === "127";
  }
  if (isIP(normalized) !== 6 || !normalized.startsWith("::ffff:")) {
    return false;
  }

  const mappedAddress = normalized.slice("::ffff:".length);
  if (isIP(mappedAddress) === 4) {
    return mappedAddress.split(".")[0] === "127";
  }
  const mappedGroups = mappedAddress.split(":");
  if (mappedGroups.length !== 2) {
    return false;
  }
  const highGroup = Number.parseInt(mappedGroups[0] ?? "", 16);
  return Number.isInteger(highGroup) && highGroup >>> 8 === 127;
}

function parseUrl(value: string | undefined, variableName: string): URL {
  if (!value) {
    throw new Error(`${variableName} is required`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL`);
  }
}

function parseAppBaseUrl(
  value: string | undefined,
  appEnvironment: AppEnvironment,
): string {
  const localEnvironment =
    appEnvironment === "local" || appEnvironment === "test";
  const url = parseUrl(
    value ?? (localEnvironment ? "http://localhost:3000" : undefined),
    "APP_BASE_URL",
  );

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_BASE_URL must be an absolute HTTP(S) origin");
  }
  if (appEnvironment === "production" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS in production");
  }
  if (localEnvironment && !isLoopbackHostname(url.hostname)) {
    throw new Error("APP_BASE_URL must use a loopback host in local or test");
  }
  if (!localEnvironment && isLoopbackHostname(url.hostname)) {
    throw new Error("APP_BASE_URL must not use a loopback host");
  }

  return url.origin;
}

function parseAppRelease(
  value: string | undefined,
  appEnvironment: AppEnvironment,
): string {
  if (value === undefined && ["local", "test"].includes(appEnvironment)) {
    return appEnvironment;
  }

  return appReleaseSchema.parse(value);
}

function isPlaceholderDatabaseHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "example.com" ||
    normalized.endsWith(".example.com") ||
    normalized.endsWith(".invalid") ||
    normalized.includes("placeholder") ||
    normalized.includes("changeme")
  );
}

function parseDatabaseUrl(
  values: Record<string, string | undefined>,
  appEnvironment: AppEnvironment,
): string {
  const localEnvironment =
    appEnvironment === "local" || appEnvironment === "test";

  if (localEnvironment) {
    if (values.DATABASE_URL) {
      throw new Error("DATABASE_URL is not allowed in local or test");
    }

    const url = parseUrl(values.LOCAL_DATABASE_URL, "LOCAL_DATABASE_URL");
    if (
      url.protocol !== "postgresql:" ||
      !isLoopbackHostname(url.hostname) ||
      url.port !== "55322"
    ) {
      throw new Error(
        "LOCAL_DATABASE_URL must target local emlak-platformu port 55322",
      );
    }
    return values.LOCAL_DATABASE_URL!;
  }

  if (values.LOCAL_DATABASE_URL) {
    throw new Error(
      "LOCAL_DATABASE_URL is not allowed in preview or production",
    );
  }

  const url = parseUrl(values.DATABASE_URL, "DATABASE_URL");
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }
  if (!url.hostname) {
    throw new Error("DATABASE_URL must include an explicit host");
  }
  if (isLoopbackHostname(url.hostname)) {
    throw new Error("DATABASE_URL must not target a loopback host");
  }
  if (isPlaceholderDatabaseHostname(url.hostname)) {
    throw new Error("DATABASE_URL must not use a placeholder host");
  }
  const tlsModes = url.searchParams.getAll("sslmode");
  if (tlsModes.length !== 1 || !TLS_DATABASE_MODES.has(tlsModes[0] ?? "")) {
    throw new Error("DATABASE_URL must require TLS with sslmode");
  }

  return values.DATABASE_URL!;
}

export function parseDatabaseReadinessEnv(
  values: Record<string, string | undefined>,
) {
  const appEnvironment = appEnvironmentSchema.parse(values.APP_ENV);
  const activeDatabaseValues =
    appEnvironment === "local" || appEnvironment === "test"
      ? { ...values, DATABASE_URL: undefined }
      : { ...values, LOCAL_DATABASE_URL: undefined };

  return {
    DATABASE_URL: parseDatabaseUrl(activeDatabaseValues, appEnvironment),
  };
}

function parseR2Configuration(
  values: Record<string, string | undefined>,
  appEnvironment: AppEnvironment,
) {
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
  if (appEnvironment === "test" && configuredR2Values.length > 0) {
    throw new Error("R2 configuration is not allowed in test");
  }
  if (appEnvironment === "production" && configuredR2Values.length === 0) {
    throw new Error("R2 configuration is required in production");
  }

  return configuredR2Values.length === 4
    ? {
        accountId: z.string().min(1).parse(values.R2_ACCOUNT_ID),
        bucketName: z.string().min(1).parse(values.R2_BUCKET_NAME),
        accessKeyId: z.string().min(1).parse(values.R2_ACCESS_KEY_ID),
        secretAccessKey: z.string().min(1).parse(values.R2_SECRET_ACCESS_KEY),
      }
    : null;
}

function parseCronSecret(
  value: string | undefined,
  appEnvironment: AppEnvironment,
): string | undefined {
  if (!value) {
    if (appEnvironment === "production") {
      throw new Error("CRON_SECRET is required in production");
    }
    return undefined;
  }
  return cronSecretSchema.parse(value);
}

function validateSupabaseResourceIdentity(
  supabaseUrl: string,
  appEnvironment: AppEnvironment,
): void {
  const loopback = isLoopbackHostname(new URL(supabaseUrl).hostname);
  if (["local", "test"].includes(appEnvironment) && !loopback) {
    throw new Error("Supabase URL must use a loopback host in local or test");
  }
  if (["preview", "production"].includes(appEnvironment) && loopback) {
    throw new Error("Supabase URL must not use a loopback host");
  }
}

export function parseServerPublicEnv(
  values: Record<string, string | undefined>,
) {
  const appEnvironment = appEnvironmentSchema.parse(values.APP_ENV);
  const publicEnv = parsePublicEnv(values);
  validateSupabaseResourceIdentity(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    appEnvironment,
  );

  return { APP_ENV: appEnvironment, ...publicEnv };
}

export function parseRuntimeIdentity(
  values: Record<string, string | undefined>,
) {
  const appEnvironment = appEnvironmentSchema.parse(values.APP_ENV);
  return {
    APP_ENV: appEnvironment,
    APP_RELEASE: parseAppRelease(values.APP_RELEASE, appEnvironment),
  };
}

export function parseServerReadinessEnv(
  values: Record<string, string | undefined>,
) {
  const serverPublicEnv = parseServerPublicEnv(values);
  const appEnvironment = serverPublicEnv.APP_ENV;

  return {
    ...serverPublicEnv,
    APP_BASE_URL: parseAppBaseUrl(values.APP_BASE_URL, appEnvironment),
    APP_RELEASE: parseAppRelease(values.APP_RELEASE, appEnvironment),
    DATABASE_URL: parseDatabaseUrl(values, appEnvironment),
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSchema.parse(
      values.SUPABASE_SERVICE_ROLE_KEY,
    ),
    LEAD_INTAKE_HMAC_SECRET: leadHmacSecretSchema.parse(
      values.LEAD_INTAKE_HMAC_SECRET,
    ),
    CRON_SECRET: parseCronSecret(values.CRON_SECRET, appEnvironment),
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
  };
}

export function parseServerEnv(values: Record<string, string | undefined>) {
  const readinessEnv = parseServerReadinessEnv(values);

  return {
    ...readinessEnv,
    R2: parseR2Configuration(values, readinessEnv.APP_ENV),
  };
}
