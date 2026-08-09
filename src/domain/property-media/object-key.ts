import type { MediaFormat } from "@/domain/property-media/media";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error("MEDIA_VALIDATION_FAILED");
}

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}

export function buildQuarantineKey(
  propertyId: string,
  mediaId: string,
  sourceVersion: number,
): string {
  assertUuid(propertyId);
  assertUuid(mediaId);
  assertPositiveInteger(sourceVersion);
  return `private/quarantine/properties/${propertyId}/${mediaId}/${sourceVersion}/source`;
}

export function buildOriginalKey(
  propertyId: string,
  mediaId: string,
  sourceVersion: number,
): string {
  assertUuid(propertyId);
  assertUuid(mediaId);
  assertPositiveInteger(sourceVersion);
  return `private/originals/properties/${propertyId}/${mediaId}/${sourceVersion}/source`;
}

export function buildVariantKey(
  input: Readonly<{
    propertyId: string;
    mediaId: string;
    sourceVersion: number;
    recipeVersion: string;
    width: number;
    format: MediaFormat;
  }>,
): string {
  assertUuid(input.propertyId);
  assertUuid(input.mediaId);
  assertPositiveInteger(input.sourceVersion);
  assertPositiveInteger(input.width);
  if (!RECIPE_PATTERN.test(input.recipeVersion)) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
  if (input.format !== "webp" && input.format !== "avif") {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
  return `delivery/properties/${input.propertyId}/${input.mediaId}/${input.sourceVersion}/${input.recipeVersion}/${input.width}.${input.format}`;
}
