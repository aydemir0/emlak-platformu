import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.unit.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    clearMocks: true,
  },
});
