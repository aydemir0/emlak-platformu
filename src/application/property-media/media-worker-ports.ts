import type { ProcessedImage } from "@/application/property-media/image-processor";

export type ProcessingClaim = Readonly<{
  attemptId: string;
  attemptNumber: number;
  recoveredStaleLease: boolean;
  mediaId: string;
  propertyId: string;
  sourceVersion: number;
  sourceObjectKey: string;
  declaredMimeType: string;
  maximumBytes: number;
  uploadedChecksumSha256: string;
  leaseOwner: string;
  leaseExpiresAt: Date;
}>;

export type StoredVariantFact = Readonly<{
  sourceVersion: number;
  recipeVersion: string;
  format: "WEBP" | "AVIF";
  widthPx: number;
  heightPx: number;
  byteSize: number;
  objectKey: string;
  checksumSha256: string;
}>;

export interface MediaWorkerRepository {
  claimNext(
    input: Readonly<{
      workerId: string;
      leaseSeconds: number;
      recipeVersion: string;
      processorVersion: string;
      now: Date;
    }>,
  ): Promise<ProcessingClaim | null>;
  complete(
    input: Readonly<{
      claim: ProcessingClaim;
      processed: ProcessedImage;
      originalObjectKey: string;
      variants: readonly StoredVariantFact[];
      now: Date;
      correlationId: string;
    }>,
  ): Promise<void>;
  fail(
    input: Readonly<{
      claim: ProcessingClaim;
      processorVersion: string;
      code: string;
      retryable: boolean;
      now: Date;
      correlationId: string;
    }>,
  ): Promise<void>;
  findAuthoritativeObjectKeys(
    keys: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
