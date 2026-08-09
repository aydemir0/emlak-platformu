import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("browser Supabase boundary", () => {
  it("bundles without the service-role credential", async () => {
    const serviceSecret = "must-never-enter-browser-bundle";
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceSecret;

    const result = await build({
      entryPoints: ["src/infrastructure/supabase/browser.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      define: {
        "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
          "http://127.0.0.1:55321",
        ),
        "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
          "public-anon-key-for-bundle-test",
        ),
      },
    });

    const bundle = result.outputFiles[0]?.text ?? "";
    expect(bundle).not.toContain(serviceSecret);
    expect(bundle).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
