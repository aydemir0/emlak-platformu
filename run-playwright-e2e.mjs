import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;

  const exit = new Promise((resolve) =>
    child.once("exit", () => resolve(true)),
  );
  return timeoutMs === undefined
    ? exit
    : Promise.race([exit, delay(timeoutMs).then(() => false)]);
}

async function stopProcess(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill();
  if (await waitForExit(child, timeoutMs)) return;

  if (process.platform === "win32" && child.pid) {
    const taskkill = spawn(
      "taskkill.exe",
      ["/pid", String(child.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    await waitForExit(taskkill, timeoutMs);
  } else {
    child.kill("SIGKILL");
  }

  if (!(await waitForExit(child, timeoutMs))) {
    throw new Error(`Process ${child.pid ?? "unknown"} did not stop`);
  }
}

async function waitForReadiness(child, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Web server exited before becoming ready at ${url}`);
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The server is still starting; retry within the bounded deadline.
    }
    await delay(100);
  }

  throw new Error(`Web server did not become ready at ${url}`);
}

function startProcess(specification, environment) {
  return spawn(specification.command, specification.args, {
    cwd: specification.cwd,
    env: environment,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
}

export async function runWithManagedServer(options) {
  const server = startProcess(options.server, options.environment);

  try {
    await waitForReadiness(
      server,
      options.readinessUrl,
      options.startupTimeoutMs,
    );

    const test = startProcess(options.test, {
      ...options.environment,
      PLAYWRIGHT_BASE_URL: options.readinessUrl,
    });
    await waitForExit(test);
    return test.exitCode ?? 1;
  } finally {
    await stopProcess(server, options.shutdownTimeoutMs);
  }
}

async function main() {
  const port = 3104;
  const baseUrl = `http://127.0.0.1:${port}`;
  const root = fileURLToPath(new URL(".", import.meta.url));
  const environment = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-for-playwright-smoke",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-key-for-playwright-smoke",
    LEAD_INTAKE_HMAC_SECRET:
      "lead-intake-playwright-secret-with-at-least-32-characters",
    CRON_SECRET: "scheduler-playwright-secret-with-at-least-32-characters",
    LOCAL_DATABASE_URL:
      "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  };

  return runWithManagedServer({
    server: {
      command: process.execPath,
      args: [
        fileURLToPath(
          new URL("./node_modules/next/dist/bin/next", import.meta.url),
        ),
        "start",
        "-p",
        String(port),
      ],
      cwd: root,
    },
    test: {
      command: process.execPath,
      args: [
        fileURLToPath(
          new URL("./node_modules/@playwright/test/cli.js", import.meta.url),
        ),
        "test",
      ],
      cwd: root,
    },
    readinessUrl: baseUrl,
    environment,
    startupTimeoutMs: 120_000,
    shutdownTimeoutMs: 10_000,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
