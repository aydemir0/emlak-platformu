import { defineConfig, devices } from "@playwright/test";

const port = 3104;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `node ./node_modules/next/dist/bin/next start -p ${port}`,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-for-playwright-smoke",
          SUPABASE_SERVICE_ROLE_KEY: "server-only-key-for-playwright-smoke",
          LEAD_INTAKE_HMAC_SECRET:
            "lead-intake-playwright-secret-with-at-least-32-characters",
          LOCAL_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: `http://127.0.0.1:${port}`,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
