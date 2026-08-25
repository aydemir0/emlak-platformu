import { randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";
import {
  assertWorkerRetryPolicy,
  emitWorkerRun,
  EMPTY_WORKER_FAILURE_CATEGORIES,
  type WorkerRunReporter,
} from "@/application/observability/worker-run";
import type { ImageProcessor } from "@/application/property-media/image-processor";
import type { MediaStorage } from "@/application/property-media/media-storage";
import type {
  MediaWorkerRepository,
  ProcessingClaim,
  StoredVariantFact,
} from "@/application/property-media/media-worker-ports";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import {
  buildOriginalKey,
  buildVariantKey,
} from "@/domain/property-media/object-key";
import {
  assertCompleteVariantSet,
  assertEncodedImageOutputLimits,
} from "@/domain/property-media/media-policy";

const DEFAULT_MEDIA_MAX_ATTEMPTS = 3;

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

async function prepareMedia(
  storage: MediaStorage,
  processor: ImageProcessor,
  claim: ProcessingClaim,
) {
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
    assertEncodedImageOutputLimits(processed.variants, PROPERTY_V1_RECIPE);
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
  return { processed, originalObjectKey, variants };
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
    maxAttempts?: number;
    reportRun?: WorkerRunReporter;
  }>,
): Promise<{ outcome: "EMPTY" | "READY" | "FAILED"; mediaId?: string }> {
  const startedAt = Date.now();
  const now = input.now?.() ?? new Date();
  const correlationId = input.correlationId?.() ?? randomUUID();
  const maxAttempts = input.maxAttempts ?? DEFAULT_MEDIA_MAX_ATTEMPTS;
  assertWorkerRetryPolicy(maxAttempts);
  let claim: Awaited<ReturnType<MediaWorkerRepository["claimNext"]>> = null;
  let succeeded = 0;
  const retried = 0;
  let deadLettered = 0;
  let storageFailures = 0;
  let validationFailures = 0;
  const report = () =>
    emitWorkerRun(input.reportRun, {
      operation: "media.process",
      correlationId,
      claimed: claim ? 1 : 0,
      succeeded,
      retried,
      deadLettered,
      staleRecovered: claim?.recoveredStaleLease ? 1 : 0,
      durationMs: Math.max(0, Date.now() - startedAt),
      failureCategories: {
        ...EMPTY_WORKER_FAILURE_CATEGORIES,
        storage: storageFailures,
        validation: validationFailures,
      },
    });
  try {
    claim = await repository.claimNext({
      workerId: input.workerId,
      leaseSeconds: 120,
      recipeVersion: PROPERTY_V1_RECIPE.version,
      processorVersion: input.processorVersion,
      now,
    });
    if (!claim) {
      report();
      return { outcome: "EMPTY" };
    }
    if (claim.attemptNumber > maxAttempts) {
      await repository.fail({
        claim,
        processorVersion: input.processorVersion,
        code: "MEDIA_MAX_ATTEMPTS_EXCEEDED",
        retryable: false,
        now,
        correlationId,
      });
      deadLettered = 1;
      storageFailures = 1;
      report();
      return { outcome: "FAILED", mediaId: claim.mediaId };
    }
    let prepared: Awaited<ReturnType<typeof prepareMedia>>;
    try {
      prepared = await prepareMedia(storage, processor, claim);
    } catch (error) {
      const deterministic =
        error instanceof ApplicationError &&
        (error.code === "MEDIA_VALIDATION_FAILED" ||
          error.message === "SOURCE_MISSING");
      const exhausted = !deterministic && claim.attemptNumber >= maxAttempts;
      const retryable = !deterministic && !exhausted;
      await repository.fail({
        claim,
        processorVersion: input.processorVersion,
        code: deterministic
          ? "VALIDATION_REJECTED"
          : exhausted
            ? "MEDIA_MAX_ATTEMPTS_EXCEEDED"
            : "PROCESSING_TRANSIENT",
        retryable,
        now,
        correlationId,
      });
      deadLettered = retryable ? 0 : 1;
      storageFailures = deterministic ? 0 : 1;
      validationFailures = deterministic ? 1 : 0;
      report();
      return { outcome: "FAILED", mediaId: claim.mediaId };
    }
    await repository.complete({
      claim,
      ...prepared,
      now,
      correlationId,
    });
    succeeded = 1;
    report();
    return { outcome: "READY", mediaId: claim.mediaId };
  } catch (error) {
    storageFailures += 1;
    report();
    throw error;
  }
}
