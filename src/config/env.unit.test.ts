import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "@/config/env.client";
import {
  parseRuntimeIdentity,
  parseServerEnv,
  parseServerPublicEnv,
  parseServerReadinessEnv,
} from "@/config/env.server";

const localPublicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-public-anon-key-for-tests",
};
const remotePublicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "remote-public-anon-key-for-tests",
};
const leadIntakeHmacSecret =
  "lead-intake-test-secret-with-at-least-32-characters";
const localDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const remoteDatabaseUrl =
  "postgresql://app_user:database-password@db.internal:5432/app?sslmode=require";

const sharedServerValues = {
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
  LEAD_INTAKE_HMAC_SECRET: leadIntakeHmacSecret,
};

const productionR2Values = {
  R2_ACCOUNT_ID: "production-account-id",
  R2_BUCKET_NAME: "production-media-bucket",
  R2_ACCESS_KEY_ID: "production-access-key-id",
  R2_SECRET_ACCESS_KEY: "production-secret-access-key",
};

describe("environment boundaries", () => {
  it("parses a bounded runtime identity independently of dependency config", () => {
    expect(
      parseRuntimeIdentity({ APP_ENV: "preview", APP_RELEASE: "release-42" }),
    ).toEqual({ APP_ENV: "preview", APP_RELEASE: "release-42" });
    expect(() =>
      parseRuntimeIdentity({
        APP_ENV: "production",
        APP_RELEASE: "release with spaces",
      }),
    ).toThrow();
  });

  it("guards server-side public Supabase configuration without requiring secrets", () => {
    expect(
      parseServerPublicEnv({
        ...localPublicValues,
        APP_ENV: "test",
      }),
    ).toEqual({ APP_ENV: "test", ...localPublicValues });

    expect(() =>
      parseServerPublicEnv({
        ...remotePublicValues,
        APP_ENV: "test",
      }),
    ).toThrow("Supabase URL must use a loopback host in local or test");
  });

  it("defaults an omitted application environment to local only", () => {
    expect(
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toMatchObject({
      APP_ENV: "local",
      APP_BASE_URL: "http://localhost:3000",
      APP_RELEASE: "local",
      DATABASE_URL: localDatabaseUrl,
    });
  });

  it.each([
    {
      appEnv: "local",
      expectedBaseUrl: "http://localhost:3000",
      expectedRelease: "local",
    },
    {
      appEnv: "test",
      expectedBaseUrl: "http://localhost:3000",
      expectedRelease: "test",
    },
  ])(
    "uses safe defaults and the local database in $appEnv",
    ({ appEnv, expectedBaseUrl, expectedRelease }) => {
      expect(
        parseServerEnv({
          ...localPublicValues,
          ...sharedServerValues,
          APP_ENV: appEnv,
          LOCAL_DATABASE_URL: localDatabaseUrl,
        }),
      ).toMatchObject({
        APP_ENV: appEnv,
        APP_BASE_URL: expectedBaseUrl,
        APP_RELEASE: expectedRelease,
        DATABASE_URL: localDatabaseUrl,
      });
    },
  );

  it("accepts an explicit preview identity and TLS database", () => {
    expect(
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        APP_ENV: "preview",
        APP_BASE_URL: "https://preview.example.test/",
        APP_RELEASE: "preview-abc123",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toMatchObject({
      APP_ENV: "preview",
      APP_BASE_URL: "https://preview.example.test",
      APP_RELEASE: "preview-abc123",
      DATABASE_URL: remoteDatabaseUrl,
    });
  });

  it("accepts a complete production identity and provider configuration", () => {
    expect(
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test/",
        APP_RELEASE: "461ca1b9d39f",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toMatchObject({
      APP_ENV: "production",
      APP_BASE_URL: "https://emlak.example.test",
      APP_RELEASE: "461ca1b9d39f",
      DATABASE_URL: remoteDatabaseUrl,
      R2: {
        accountId: "production-account-id",
        bucketName: "production-media-bucket",
      },
    });
  });

  it("keeps R2 outside critical runtime readiness validation", () => {
    const withoutR2 = {
      ...remotePublicValues,
      ...sharedServerValues,
      APP_ENV: "production",
      APP_BASE_URL: "https://emlak.example.test/",
      APP_RELEASE: "461ca1b9d39f",
      DATABASE_URL: remoteDatabaseUrl,
    };

    expect(parseServerReadinessEnv(withoutR2)).toMatchObject({
      APP_ENV: "production",
      APP_RELEASE: "461ca1b9d39f",
      DATABASE_URL: remoteDatabaseUrl,
    });
    expect(() => parseServerEnv(withoutR2)).toThrow(
      "R2 configuration is required in production",
    );
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: undefined }],
    ["APP_RELEASE", { APP_RELEASE: undefined }],
  ])("rejects production without %s", (_name, missingValue) => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
        ...missingValue,
      }),
    ).toThrow();
  });

  it("requires explicit preview origin and release identity", () => {
    for (const missingValue of [
      { APP_BASE_URL: undefined },
      { APP_RELEASE: undefined },
    ]) {
      expect(() =>
        parseServerEnv({
          ...remotePublicValues,
          ...sharedServerValues,
          APP_ENV: "preview",
          APP_BASE_URL: "https://preview.example.test",
          APP_RELEASE: "preview-1",
          DATABASE_URL: remoteDatabaseUrl,
          ...missingValue,
        }),
      ).toThrow();
    }
  });

  it("rejects a loopback production database", () => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: `${localDatabaseUrl}?sslmode=require`,
      }),
    ).toThrow("DATABASE_URL must not target a loopback host");
  });

  it("requires HTTPS for the production application origin", () => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "http://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("APP_BASE_URL must use HTTPS in production");
  });

  it.each([
    "not-a-url",
    "https://emlak.example.test/path",
    "https://emlak.example.test/?query=value",
    "https://emlak.example.test/#fragment",
  ])("rejects malformed or non-origin APP_BASE_URL value %s", (appBaseUrl) => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        APP_ENV: "preview",
        APP_BASE_URL: appBaseUrl,
        APP_RELEASE: "preview-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow();
  });

  it.each([
    "not-a-url",
    "https://db.internal/app?sslmode=require",
    "postgresql:///app?sslmode=require",
    "postgresql://app:password@localhost.:5432/app?sslmode=require",
    "postgresql://app:password@127.42.0.1:5432/app?sslmode=require",
    "postgresql://app:password@[::ffff:127.0.0.1]:5432/app?sslmode=require",
    "postgresql://app:password@db.internal:5432/app",
    "postgresql://app:password@db.internal:5432/app?sslmode=require&sslmode=disable",
    "postgresql://app:password@example.com:5432/app?sslmode=require",
  ])(
    "rejects malformed, non-TLS, or placeholder DATABASE_URL value %s",
    (databaseUrl) => {
      expect(() =>
        parseServerEnv({
          ...remotePublicValues,
          ...sharedServerValues,
          APP_ENV: "preview",
          APP_BASE_URL: "https://preview.example.test",
          APP_RELEASE: "preview-1",
          DATABASE_URL: databaseUrl,
        }),
      ).toThrow();
    },
  );

  it("rejects cross-environment database and provider resources", () => {
    expect(() =>
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        APP_ENV: "test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("DATABASE_URL is not allowed in local or test");

    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow("LOCAL_DATABASE_URL is not allowed in preview or production");

    expect(() =>
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow("R2 configuration is not allowed in test");
  });

  it("rejects provable cross-environment public resource identities", () => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        APP_ENV: "test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow("Supabase URL must use a loopback host in local or test");

    expect(() =>
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        APP_ENV: "preview",
        APP_BASE_URL: "https://preview.example.test",
        APP_RELEASE: "preview-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("Supabase URL must not use a loopback host");

    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        NEXT_PUBLIC_SUPABASE_URL: "https://localhost.:54321",
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("Supabase URL must not use a loopback host");

    expect(() =>
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        APP_ENV: "test",
        APP_BASE_URL: "https://production.example.test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow("APP_BASE_URL must use a loopback host in local or test");

    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://localhost.",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("APP_BASE_URL must not use a loopback host");
  });

  it("requires complete R2 configuration in production", () => {
    expect(() =>
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: remoteDatabaseUrl,
      }),
    ).toThrow("R2 configuration is required in production");
  });

  it("does not include database credentials in validation errors", () => {
    const password = "never-print-this-database-password";
    let message = "";

    try {
      parseServerEnv({
        ...remotePublicValues,
        ...sharedServerValues,
        ...productionR2Values,
        APP_ENV: "production",
        APP_BASE_URL: "https://emlak.example.test",
        APP_RELEASE: "release-1",
        DATABASE_URL: `postgresql://release_user:${password}@127.0.0.1:5432/app?sslmode=require`,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(password);
    expect(message).not.toContain("release_user");
  });

  it("uses the centralized matching candidate default and rejects invalid overrides", () => {
    const values = {
      ...localPublicValues,
      ...sharedServerValues,
      APP_ENV: "test",
      LOCAL_DATABASE_URL: localDatabaseUrl,
    };
    expect(parseServerEnv(values).MATCHING_CANDIDATE_LIMIT).toBe(500);
    expect(
      parseServerEnv({ ...values, MATCHING_CANDIDATE_LIMIT: "3" })
        .MATCHING_CANDIDATE_LIMIT,
    ).toBe(3);
    expect(() =>
      parseServerEnv({ ...values, MATCHING_CANDIDATE_LIMIT: "0" }),
    ).toThrow();
    expect(() =>
      parseServerEnv({ ...values, MATCHING_CANDIDATE_LIMIT: "501" }),
    ).toThrow();
  });

  it("returns only public-safe Supabase values from client configuration", () => {
    expect(
      parsePublicEnv({
        ...localPublicValues,
        SUPABASE_SERVICE_ROLE_KEY: "secret",
      }),
    ).toEqual(localPublicValues);
  });

  it("rejects a malformed public Supabase URL", () => {
    expect(() =>
      parsePublicEnv({
        ...localPublicValues,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("requires the service role key at the privileged server boundary", () => {
    expect(() =>
      parseServerEnv({
        ...localPublicValues,
        APP_ENV: "test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow();
    expect(
      parseServerEnv({
        ...localPublicValues,
        ...sharedServerValues,
        APP_ENV: "test",
        LOCAL_DATABASE_URL: localDatabaseUrl,
      }),
    ).toMatchObject({
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
    });
  });

  it("accepts omitted R2 configuration locally but rejects partial credentials", () => {
    const base = {
      ...localPublicValues,
      ...sharedServerValues,
      APP_ENV: "local",
      LOCAL_DATABASE_URL: localDatabaseUrl,
    };
    expect(parseServerEnv(base).R2).toBeNull();
    expect(() =>
      parseServerEnv({ ...base, R2_ACCOUNT_ID: "account-id" }),
    ).toThrow("R2 configuration must be provided as one complete group");
    expect(
      parseServerEnv({
        ...base,
        R2_ACCOUNT_ID: "account-id",
        R2_BUCKET_NAME: "media-bucket",
        R2_ACCESS_KEY_ID: "access-key-id",
        R2_SECRET_ACCESS_KEY: "secret-access-key",
      }).R2,
    ).toEqual({
      accountId: "account-id",
      bucketName: "media-bucket",
      accessKeyId: "access-key-id",
      secretAccessKey: "secret-access-key",
    });
  });
});
