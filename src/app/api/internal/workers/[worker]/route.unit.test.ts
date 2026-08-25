import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerReadinessEnv, runConfiguredWorker } = vi.hoisted(() => ({
  getServerReadinessEnv: vi.fn(),
  runConfiguredWorker: vi.fn(),
}));

vi.mock("@/config/env.server.runtime", () => ({ getServerReadinessEnv }));
vi.mock("@/infrastructure/workers/configured-worker.server", () => ({
  runConfiguredWorker,
  isScheduledWorkerName: (value: string) =>
    [
      "lead-outbox",
      "appointment-reminders",
      "media-processing",
      "media-reconciliation",
      "maintenance",
    ].includes(value),
  ConfiguredWorkerUnavailableError: class extends Error {},
}));
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportUnexpectedError: vi.fn(),
}));

import { POST } from "@/app/api/internal/workers/[worker]/route";

const secret = "x".repeat(40);
const runId = "40000000-0000-4000-8000-000000000004";

function request(authorization?: string) {
  return new Request("http://localhost/api/internal/workers/media-processing", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      "x-run-id": runId,
    },
  });
}

describe("scheduled worker HTTP boundary", () => {
  beforeEach(() => {
    getServerReadinessEnv.mockReset();
    runConfiguredWorker.mockReset();
    getServerReadinessEnv.mockReturnValue({ CRON_SECRET: secret });
  });

  it("rejects unauthenticated invocation before composing a worker", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ worker: "media-processing" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(runConfiguredWorker).not.toHaveBeenCalled();
  });

  it("runs one named bounded worker and returns its safe summary", async () => {
    runConfiguredWorker.mockResolvedValue({
      operation: "media.process",
      runId,
      outcome: "completed",
      claimed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
    });

    const response = await POST(request(`Bearer ${secret}`), {
      params: Promise.resolve({ worker: "media-processing" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      operation: "media.process",
      runId,
      outcome: "completed",
      claimed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(runConfiguredWorker).toHaveBeenCalledWith("media-processing", runId);
  });

  it("fails closed for an unknown worker without exposing internals", async () => {
    const response = await POST(request(`Bearer ${secret}`), {
      params: Promise.resolve({ worker: "not-a-worker" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(runConfiguredWorker).not.toHaveBeenCalled();
  });
});
