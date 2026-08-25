import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ImageProcessor } from "@/application/property-media/image-processor";
import { WorkerLeaseLostError } from "@/application/observability/worker-run";
import type {
  MediaWorkerRepository,
  ProcessingClaim,
} from "@/application/property-media/media-worker-ports";
import { processNextMedia } from "@/application/property-media/process-next-media";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";

const propertyId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const claim: ProcessingClaim = {
  attemptId: "33333333-3333-4333-8333-333333333333",
  attemptNumber: 1,
  recoveredStaleLease: false,
  propertyId,
  mediaId,
  sourceVersion: 1,
  sourceObjectKey: `private/quarantine/properties/${propertyId}/${mediaId}/1/source`,
  declaredMimeType: "image/jpeg",
  maximumBytes: 3,
  uploadedChecksumSha256: createHash("sha256")
    .update(new Uint8Array([1, 2, 3]))
    .digest("hex"),
  leaseOwner: "worker-1",
  leaseExpiresAt: new Date("2026-08-09T12:02:00Z"),
};

function repository(next: ProcessingClaim | null = claim) {
  return {
    claimNext: vi.fn().mockResolvedValue(next),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    findAuthoritativeObjectKeys: vi.fn().mockResolvedValue(new Set()),
  } satisfies MediaWorkerRepository;
}

describe("processNextMedia", () => {
  it.each([
    {
      name: "per-variant",
      width: 3,
      variants: [
        { width: 3, format: "webp" as const, bytes: 15 * 1024 * 1024 + 1 },
        { width: 3, format: "avif" as const, bytes: 1 },
      ],
    },
    {
      name: "aggregate",
      width: 1400,
      variants: [
        { width: 640, format: "webp" as const, bytes: 4 * 1024 * 1024 },
        { width: 640, format: "avif" as const, bytes: 4 * 1024 * 1024 },
        { width: 1280, format: "webp" as const, bytes: 4 * 1024 * 1024 },
        { width: 1280, format: "avif" as const, bytes: 4 * 1024 * 1024 },
      ],
    },
  ])(
    "rejects $name encoded output before writing an original or variant",
    async ({ width, variants }) => {
      const sourceBytes = new Uint8Array([1, 2, 3]);
      const checksum = createHash("sha256").update(sourceBytes).digest("hex");
      const storage = new DeterministicMediaStorage();
      await storage.put({
        key: claim.sourceObjectKey,
        bytes: sourceBytes,
        contentType: "image/jpeg",
        checksumSha256: checksum,
        ifAbsent: true,
      });
      const put = vi.spyOn(storage, "put");
      const repo = repository();
      const processor: ImageProcessor = {
        process: vi.fn().mockResolvedValue({
          detectedMimeType: "image/jpeg",
          width,
          height: 1,
          byteSize: sourceBytes.byteLength,
          checksumSha256: checksum,
          processorVersion: "sharp-test",
          variants: variants.map((variant) => {
            const bytes = new Uint8Array(variant.bytes);
            return {
              format: variant.format,
              mimeType: variant.format === "webp" ? "image/webp" : "image/avif",
              width: variant.width,
              height: 1,
              bytes,
              checksumSha256: createHash("sha256").update(bytes).digest("hex"),
            };
          }),
        }),
      };

      await expect(
        processNextMedia(repo, storage, processor, {
          workerId: "worker-1",
          processorVersion: "sharp-test",
        }),
      ).resolves.toEqual({ outcome: "FAILED", mediaId });

      expect(put).not.toHaveBeenCalled();
      expect(repo.complete).not.toHaveBeenCalled();
      expect(repo.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "VALIDATION_REJECTED",
          retryable: false,
        }),
      );
    },
  );

  it("defines coherent encoded output ceilings within the source pipeline budget", () => {
    expect(PROPERTY_V1_RECIPE.maximumVariantBytes).toBe(
      PROPERTY_V1_RECIPE.maximumBytes,
    );
    expect(PROPERTY_V1_RECIPE.maximumTotalVariantBytes).toBe(
      PROPERTY_V1_RECIPE.maximumBytes,
    );
  });

  it("stores immutable original/variants and completes only after storage", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const storage = new DeterministicMediaStorage(
      new Date("2026-08-09T12:00:00Z"),
    );
    await storage.put({
      key: claim.sourceObjectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    });
    const processor: ImageProcessor = {
      process: vi.fn().mockResolvedValue({
        detectedMimeType: "image/jpeg",
        width: 3,
        height: 1,
        byteSize: 3,
        checksumSha256: checksum,
        processorVersion: "sharp-test",
        variants: [
          {
            format: "webp",
            mimeType: "image/webp",
            width: 3,
            height: 1,
            bytes,
            checksumSha256: checksum,
          },
          {
            format: "avif",
            mimeType: "image/avif",
            width: 3,
            height: 1,
            bytes,
            checksumSha256: checksum,
          },
        ],
      }),
    };
    const repo = repository();
    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
        now: () => new Date("2026-08-09T12:00:00Z"),
        correlationId: () => "44444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toEqual({ outcome: "READY", mediaId });
    expect(repo.complete).toHaveBeenCalledOnce();
    expect(repo.fail).not.toHaveBeenCalled();
    expect(
      (await storage.list(`delivery/properties/${propertyId}/`, undefined, 10))
        .objects,
    ).toHaveLength(2);
  });

  it("marks missing input as a deterministic non-retryable failure", async () => {
    const repo = repository();
    const storage = new DeterministicMediaStorage();
    const processor = { process: vi.fn() } satisfies ImageProcessor;
    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
      }),
    ).resolves.toMatchObject({ outcome: "FAILED" });
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_REJECTED",
        retryable: false,
      }),
    );
  });

  it("rejects source bytes changed after upload finalization", async () => {
    const storage = new DeterministicMediaStorage();
    const changed = new Uint8Array([3, 2, 1]);
    await storage.put({
      key: claim.sourceObjectKey,
      bytes: changed,
      contentType: "image/jpeg",
      checksumSha256: createHash("sha256").update(changed).digest("hex"),
      ifAbsent: true,
    });
    const repo = repository();
    const processor = { process: vi.fn() } satisfies ImageProcessor;
    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
      }),
    ).resolves.toMatchObject({ outcome: "FAILED" });
    expect(processor.process).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_REJECTED",
        retryable: false,
      }),
    );
  });

  it("never marks an incomplete recipe output READY", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const storage = new DeterministicMediaStorage();
    await storage.put({
      key: claim.sourceObjectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    });
    const repo = repository();
    const processor: ImageProcessor = {
      process: vi.fn().mockResolvedValue({
        detectedMimeType: "image/jpeg",
        width: 3,
        height: 1,
        byteSize: 3,
        checksumSha256: checksum,
        processorVersion: "sharp-test",
        variants: [],
      }),
    };
    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
      }),
    ).resolves.toMatchObject({ outcome: "FAILED" });
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false }),
    );
  });

  it("returns empty without touching providers when no claim is available", async () => {
    const repo = repository(null);
    const storage = new DeterministicMediaStorage();
    const processor = { process: vi.fn() } satisfies ImageProcessor;
    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
      }),
    ).resolves.toEqual({ outcome: "EMPTY" });
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("terminalizes an over-ceiling media attempt before touching storage or processing", async () => {
    const repo = repository({
      ...claim,
      attemptNumber: 4,
      recoveredStaleLease: true,
    } as ProcessingClaim);
    const storage = new DeterministicMediaStorage();
    const processor = { process: vi.fn() } satisfies ImageProcessor;
    const reportRun = vi.fn();

    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
        maxAttempts: 3,
        correlationId: () => "media-worker-run-1",
        reportRun,
      }),
    ).resolves.toEqual({ outcome: "FAILED", mediaId });

    expect(processor.process).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "MEDIA_MAX_ATTEMPTS_EXCEEDED",
        retryable: false,
      }),
    );
    expect(reportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "media.process",
        correlationId: "media-worker-run-1",
        claimed: 1,
        succeeded: 0,
        retried: 0,
        deadLettered: 1,
        staleRecovered: 1,
        failureCategories: {
          application: 0,
          dependency: 0,
          storage: 1,
          validation: 0,
        },
      }),
    );
  });

  it("rejects a non-positive media attempt ceiling before claiming work", async () => {
    const repo = repository();

    await expect(
      processNextMedia(
        repo,
        new DeterministicMediaStorage(),
        { process: vi.fn() },
        {
          workerId: "worker-1",
          processorVersion: "sharp-test",
          maxAttempts: 0,
        },
      ),
    ).rejects.toThrow("WORKER_RETRY_POLICY_INVALID");
    expect(repo.claimNext).not.toHaveBeenCalled();
  });

  it("reports a safe storage category when media claiming fails", async () => {
    const repo = repository();
    const claimError = new Error(
      "postgres://user:password@db.internal/customer@example.test",
    );
    repo.claimNext.mockRejectedValueOnce(claimError);
    const reportRun = vi.fn();

    await expect(
      processNextMedia(
        repo,
        new DeterministicMediaStorage(),
        { process: vi.fn() },
        {
          workerId: "worker-1",
          processorVersion: "sharp-test",
          correlationId: () => "media-worker-run-claim-failure",
          reportRun,
        },
      ),
    ).rejects.toBe(claimError);
    expect(reportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: 0,
        retried: 0,
        deadLettered: 0,
        failureCategories: {
          application: 0,
          dependency: 0,
          storage: 1,
          validation: 0,
        },
      }),
    );
    expect(JSON.stringify(reportRun.mock.calls)).not.toMatch(
      /password|customer@example/i,
    );
  });

  it("does not count a retry when a transient failure only becomes manually retryable", async () => {
    const repo = repository();
    const storage = new DeterministicMediaStorage();
    vi.spyOn(storage, "get").mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    const reportRun = vi.fn();

    await expect(
      processNextMedia(
        repo,
        storage,
        { process: vi.fn() },
        {
          workerId: "worker-1",
          processorVersion: "sharp-test",
          correlationId: () => "media-worker-manual-retry-required",
          reportRun,
        },
      ),
    ).resolves.toEqual({ outcome: "FAILED", mediaId });

    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true }),
    );
    expect(reportRun).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: 1, retried: 0, deadLettered: 0 }),
    );
  });

  it("does not terminalize a claim after completion loses its lease", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const storage = new DeterministicMediaStorage();
    await storage.put({
      key: claim.sourceObjectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    });
    const leaseError = new WorkerLeaseLostError(
      "media.process",
      claim.attemptId,
    );
    const repo = repository();
    repo.complete.mockRejectedValueOnce(leaseError);
    const processor: ImageProcessor = {
      process: vi.fn().mockResolvedValue({
        detectedMimeType: "image/jpeg",
        width: 3,
        height: 1,
        byteSize: 3,
        checksumSha256: checksum,
        processorVersion: "sharp-test",
        variants: [
          {
            format: "webp",
            mimeType: "image/webp",
            width: 3,
            height: 1,
            bytes,
            checksumSha256: checksum,
          },
          {
            format: "avif",
            mimeType: "image/avif",
            width: 3,
            height: 1,
            bytes,
            checksumSha256: checksum,
          },
        ],
      }),
    };
    const reporter = vi.fn();

    await expect(
      processNextMedia(repo, storage, processor, {
        workerId: "worker-1",
        processorVersion: "sharp-test",
        correlationId: () => "media-worker-run-lease-loss",
        reportRun: reporter,
      }),
    ).rejects.toBe(leaseError);
    expect(repo.fail).not.toHaveBeenCalled();
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: 1, succeeded: 0, deadLettered: 0 }),
    );
  });

  it("emits one progress-preserving summary when terminalization fails", async () => {
    const terminalizationError = new Error("database unavailable");
    const repo = repository({ ...claim, attemptNumber: 4 });
    repo.fail.mockRejectedValueOnce(terminalizationError);
    const reporter = vi.fn();

    await expect(
      processNextMedia(
        repo,
        new DeterministicMediaStorage(),
        { process: vi.fn() },
        {
          workerId: "worker-1",
          processorVersion: "sharp-test",
          maxAttempts: 3,
          correlationId: () => "media-worker-terminalization-failure",
          reportRun: reporter,
        },
      ),
    ).rejects.toBe(terminalizationError);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: 1, retried: 0, deadLettered: 0 }),
    );
  });
});
