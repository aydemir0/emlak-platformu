import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "@/config/env.client";
import { parseServerEnv } from "@/config/env.server";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-public-anon-key-for-tests",
};
const leadIntakeHmacSecret =
  "lead-intake-test-secret-with-at-least-32-characters";

describe("environment boundaries", () => {
  it("uses the centralized matching candidate default and rejects invalid overrides", () => {
    const values = {
      ...publicValues,
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
      LEAD_INTAKE_HMAC_SECRET: leadIntakeHmacSecret,
      LOCAL_DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
    };
    expect(parseServerEnv(values).MATCHING_CANDIDATE_LIMIT).toBe(500);
    expect(
      parseServerEnv({ ...values, MATCHING_CANDIDATE_LIMIT: "3" })
        .MATCHING_CANDIDATE_LIMIT,
    ).toBe(3);
    expect(() =>
      parseServerEnv({ ...values, MATCHING_CANDIDATE_LIMIT: "0" }),
    ).toThrow();
  });
  it("returns only public-safe Supabase values from client configuration", () => {
    expect(
      parsePublicEnv({ ...publicValues, SUPABASE_SERVICE_ROLE_KEY: "secret" }),
    ).toEqual(publicValues);
  });

  it("rejects a malformed public Supabase URL", () => {
    expect(() =>
      parsePublicEnv({
        ...publicValues,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("requires the service role key at the privileged server boundary", () => {
    expect(() => parseServerEnv(publicValues)).toThrow();
    expect(
      parseServerEnv({
        ...publicValues,
        SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
        LEAD_INTAKE_HMAC_SECRET: leadIntakeHmacSecret,
        LOCAL_DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      }),
    ).toMatchObject({
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
    });
  });

  it("rejects remote or wrong-port database URLs", () => {
    expect(() =>
      parseServerEnv({
        ...publicValues,
        SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
        LEAD_INTAKE_HMAC_SECRET: leadIntakeHmacSecret,
        LOCAL_DATABASE_URL:
          "postgresql://postgres:secret@example.supabase.co:5432/postgres",
      }),
    ).toThrow(
      "LOCAL_DATABASE_URL must target local emlak-platformu port 55322",
    );
  });

  it("accepts omitted R2 configuration but rejects partial credentials", () => {
    const base = {
      ...publicValues,
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
      LEAD_INTAKE_HMAC_SECRET: leadIntakeHmacSecret,
      LOCAL_DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
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
