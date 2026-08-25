import { beforeEach, describe, expect, it, vi } from "vitest";

const { processNextMedia, reportWorkerRun } = vi.hoisted(() => ({
  processNextMedia: vi.fn(),
  reportWorkerRun: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/application/property-media/process-next-media", () => ({
  processNextMedia,
}));
vi.mock("@/infrastructure/observability/runtime-observability.server", () => ({
  reportWorkerRun,
}));
vi.mock("@/infrastructure/property-media/media-storage-factory.server", () => ({
  getMediaStorage: () => ({ kind: "storage" }),
}));
vi.mock(
  "@/infrastructure/property-media/postgres-media-unit-of-work.server",
  () => ({
    PostgresMediaWorkerRepository: class {},
  }),
);
vi.mock("@/infrastructure/property-media/sharp-image-processor.server", () => ({
  SharpImageProcessor: class {},
}));
vi.mock("@/config/env.server.runtime", () => ({
  getRuntimeIdentity: () => ({ APP_RELEASE: "release-1" }),
}));

import {
  ConfiguredWorkerUnavailableError,
  runConfiguredWorker,
} from "@/infrastructure/workers/configured-worker.server";

const runId = "50000000-0000-4000-8000-000000000005";

describe("configured production workers", () => {
  beforeEach(() => {
    processNextMedia.mockReset();
    reportWorkerRun.mockReset();
  });

  it("composes one bounded media-processing claim", async () => {
    processNextMedia.mockImplementation(
      async (_repo, _storage, _processor, options) => {
        options.reportRun({
          operation: "media.process",
          correlationId: runId,
          claimed: 1,
          succeeded: 1,
          retried: 0,
          deadLettered: 0,
          staleRecovered: 0,
          durationMs: 12,
          failureCategories: {
            application: 0,
            dependency: 0,
            storage: 0,
            validation: 0,
          },
        });
        return { outcome: "READY" };
      },
    );

    await expect(
      runConfiguredWorker("media-processing", runId),
    ).resolves.toEqual({
      operation: "media.process",
      runId,
      outcome: "completed",
      claimed: 1,
      succeeded: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(processNextMedia).toHaveBeenCalledOnce();
    expect(reportWorkerRun).toHaveBeenCalledOnce();
  });

  it.each([
    "lead-outbox",
    "appointment-reminders",
    "media-reconciliation",
    "maintenance",
  ] as const)(
    "fails closed before claiming when %s dependencies are not configured",
    async (worker) => {
      await expect(runConfiguredWorker(worker, runId)).rejects.toBeInstanceOf(
        ConfiguredWorkerUnavailableError,
      );
      expect(processNextMedia).not.toHaveBeenCalled();
    },
  );
});
