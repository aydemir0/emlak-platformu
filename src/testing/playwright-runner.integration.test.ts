import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { runWithManagedServer } from "../../run-playwright-e2e.mjs";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe("managed Playwright runner", () => {
  it("returns after the test command and releases the web-server port", async () => {
    const port = await reservePort();
    const serverSource = [
      'const http = require("node:http")',
      `http.createServer((_request, response) => response.end("ready")).listen(${port}, "127.0.0.1")`,
    ].join(";");

    const exitCode = await runWithManagedServer({
      server: { command: process.execPath, args: ["-e", serverSource] },
      test: { command: process.execPath, args: ["-e", "process.exit(0)"] },
      readinessUrl: `http://127.0.0.1:${port}`,
      environment: process.env,
      startupTimeoutMs: 5_000,
      shutdownTimeoutMs: 5_000,
    });

    expect(exitCode).toBe(0);
    await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
  });
});
