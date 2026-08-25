import type {
  MediaOrderingItem,
  MediaRecipe,
  MediaState,
  MediaVisibility,
} from "@/domain/property-media/media";

export type PublicEligibilityFacts = Readonly<{
  mediaState: MediaState;
  visibility: MediaVisibility;
  mediaDeleted: boolean;
  propertyState: string;
  propertyDeleted: boolean;
  currentSourceVersion: boolean;
  deliveryDenied: boolean;
}>;

export function isPublicEligible(facts: PublicEligibilityFacts): boolean {
  return (
    facts.mediaState === "READY" &&
    facts.visibility === "PUBLIC" &&
    !facts.mediaDeleted &&
    facts.propertyState === "ACTIVE" &&
    !facts.propertyDeleted &&
    facts.currentSourceVersion &&
    !facts.deliveryDenied
  );
}

export function selectVariantWidths(
  normalizedSourceWidth: number,
  recipe: MediaRecipe,
): number[] {
  if (
    !Number.isSafeInteger(normalizedSourceWidth) ||
    normalizedSourceWidth <= 0
  ) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
  const widths: number[] = recipe.widths.filter(
    (width) => width < normalizedSourceWidth,
  );
  const largestCandidate = recipe.widths.at(-1)!;
  if (normalizedSourceWidth <= largestCandidate)
    widths.push(normalizedSourceWidth);
  return [...new Set(widths)];
}

export function assertDecodedImageLimits(
  facts: Readonly<{ width: number; height: number; pages: number }>,
  recipe: MediaRecipe,
): void {
  if (
    !Number.isSafeInteger(facts.width) ||
    !Number.isSafeInteger(facts.height) ||
    facts.width <= 0 ||
    facts.height <= 0 ||
    facts.width > recipe.maximumEdgePixels ||
    facts.height > recipe.maximumEdgePixels ||
    facts.width * facts.height > recipe.maximumPixels ||
    facts.pages !== 1
  ) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}

export function assertCompleteVariantSet(
  sourceWidth: number,
  variants: readonly {
    width: number;
    height: number;
    format: string;
    bytes: Uint8Array;
  }[],
  recipe: MediaRecipe,
): void {
  const expected = selectVariantWidths(sourceWidth, recipe).flatMap((width) =>
    ["webp", "avif"].map((format) => `${width}:${format}`),
  );
  const actual = variants.map(
    (variant) => `${variant.width}:${variant.format}`,
  );
  if (
    variants.some(
      (variant) =>
        variant.width <= 0 ||
        variant.height <= 0 ||
        variant.bytes.byteLength <= 0,
    ) ||
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((identity) => !actual.includes(identity))
  ) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}

export function assertEncodedImageOutputLimits(
  variants: readonly { bytes: Uint8Array }[],
  recipe: MediaRecipe,
): void {
  let totalBytes = 0;
  for (const variant of variants) {
    if (
      variant.bytes.byteLength === 0 ||
      variant.bytes.byteLength > recipe.maximumVariantBytes
    ) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    totalBytes += variant.bytes.byteLength;
    if (totalBytes > recipe.maximumTotalVariantBytes) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
  }
}

export function assertCompleteOrdering(
  activeMediaIds: readonly string[],
  requested: readonly MediaOrderingItem[],
): void {
  const active = new Set(activeMediaIds);
  const requestedIds = new Set(requested.map((item) => item.mediaId));
  if (
    active.size !== activeMediaIds.length ||
    requestedIds.size !== requested.length ||
    active.size !== requestedIds.size ||
    [...active].some((id) => !requestedIds.has(id))
  ) {
    throw new Error("MEDIA_CONFLICT");
  }
  const orders = [...requested.map((item) => item.sortOrder)].sort(
    (left, right) => left - right,
  );
  const dense = orders.every((order, index) => order === index + 1);
  const covers = requested.filter((item) => item.isCover).length;
  if (!dense || (requested.length > 0 && covers !== 1)) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}
