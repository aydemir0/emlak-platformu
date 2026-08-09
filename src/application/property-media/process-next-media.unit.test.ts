import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ImageProcessor } from "@/application/property-media/image-processor";
import type {
  MediaWorkerRepository,
  ProcessingClaim,
} from "@/application/property-media/media-worker-ports";
import { processNextMedia } from "@/application/property-media/process-next-media";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";

const propertyId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const claim: ProcessingClaim = {
  attemptId: "33333333-3333-4333-8333-333333333333",
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
});
