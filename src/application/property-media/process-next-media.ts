import { randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";
import type { ImageProcessor } from "@/application/property-media/image-processor";
import type { MediaStorage } from "@/application/property-media/media-storage";
import type {
  MediaWorkerRepository,
  StoredVariantFact,
} from "@/application/property-media/media-worker-ports";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import {
  buildOriginalKey,
  buildVariantKey,
} from "@/domain/property-media/object-key";
import { assertCompleteVariantSet } from "@/domain/property-media/media-policy";

async function putImmutable(
  storage: MediaStorage,
  input: Parameters<MediaStorage["put"]>[0],
): Promise<void> {
  try {
    await storage.put(input);
  } catch (error) {
    const existing = await storage.head(input.key);
    if (
      !existing ||
      existing.size !== input.bytes.byteLength ||
      existing.checksumSha256 !== input.checksumSha256 ||
      existing.contentType !== input.contentType
    ) {
      throw error;
    }
  }
}

export async function processNextMedia(
  repository: MediaWorkerRepository,
  storage: MediaStorage,
  processor: ImageProcessor,
  input: Readonly<{
    workerId: string;
    processorVersion: string;
    now?: () => Date;
    correlationId?: () => string;
  }>,
): Promise<{ outcome: "EMPTY" | "READY" | "FAILED"; mediaId?: string }> {
  const now = input.now?.() ?? new Date();
  const correlationId = input.correlationId?.() ?? randomUUID();
  const claim = await repository.claimNext({
    workerId: input.workerId,
    leaseSeconds: 120,
    recipeVersion: PROPERTY_V1_RECIPE.version,
    processorVersion: input.processorVersion,
    now,
  });
  if (!claim) return { outcome: "EMPTY" };
  try {
    const source = await storage.get(claim.sourceObjectKey, claim.maximumBytes);
    if (!source)
      throw new ApplicationError("MEDIA_PROCESSING_FAILED", "SOURCE_MISSING");
    if (source.metadata.checksumSha256 !== claim.uploadedChecksumSha256) {
      throw new ApplicationError(
        "MEDIA_VALIDATION_FAILED",
        "SOURCE_CHECKSUM_CHANGED",
      );
    }
    const processed = await processor.process(
      source.bytes,
      claim.declaredMimeType,
      PROPERTY_V1_RECIPE,
    );
    try {
      assertCompleteVariantSet(
        processed.width,
        processed.variants,
        PROPERTY_V1_RECIPE,
      );
    } catch (error) {
      throw new ApplicationError(
        "MEDIA_VALIDATION_FAILED",
        "MEDIA_VALIDATION_FAILED",
        { cause: error },
      );
    }
    const originalObjectKey = buildOriginalKey(
      claim.propertyId,
      claim.mediaId,
      claim.sourceVersion,
    );
    await putImmutable(storage, {
      key: originalObjectKey,
      bytes: source.bytes,
      contentType: processed.detectedMimeType,
      checksumSha256: processed.checksumSha256,
      ifAbsent: true,
    });
    const variants: StoredVariantFact[] = [];
    for (const variant of processed.variants) {
      const objectKey = buildVariantKey({
        propertyId: claim.propertyId,
        mediaId: claim.mediaId,
        sourceVersion: claim.sourceVersion,
        recipeVersion: PROPERTY_V1_RECIPE.version,
        width: variant.width,
        format: variant.format,
      });
      await putImmutable(storage, {
        key: objectKey,
        bytes: variant.bytes,
        contentType: variant.mimeType,
        checksumSha256: variant.checksumSha256,
        cacheControl: "public,max-age=31536000,immutable",
        ifAbsent: true,
      });
      variants.push({
        sourceVersion: claim.sourceVersion,
        recipeVersion: PROPERTY_V1_RECIPE.version,
        format: variant.format.toUpperCase() as "WEBP" | "AVIF",
        widthPx: variant.width,
        heightPx: variant.height,
        byteSize: variant.bytes.byteLength,
        objectKey,
        checksumSha256: variant.checksumSha256,
      });
    }
    await repository.complete({
      claim,
      processed,
      originalObjectKey,
      variants,
      now,
      correlationId,
    });
    return { outcome: "READY", mediaId: claim.mediaId };
  } catch (error) {
    const deterministic =
      error instanceof ApplicationError &&
      (error.code === "MEDIA_VALIDATION_FAILED" ||
        error.message === "SOURCE_MISSING");
    await repository.fail({
      claim,
      processorVersion: input.processorVersion,
      code: deterministic ? "VALIDATION_REJECTED" : "PROCESSING_TRANSIENT",
      retryable: !deterministic,
      now,
      correlationId,
    });
    return { outcome: "FAILED", mediaId: claim.mediaId };
  }
}
