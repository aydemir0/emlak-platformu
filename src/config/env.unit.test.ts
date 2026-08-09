import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "@/config/env.client";
import { parseServerEnv } from "@/config/env.server";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-public-anon-key-for-tests",
};

describe("environment boundaries", () => {
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
      }),
    ).toMatchObject({
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
    });
  });
});
