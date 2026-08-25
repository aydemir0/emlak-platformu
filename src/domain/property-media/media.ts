export type MediaState =
  "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";

export type MediaVisibility = "PRIVATE" | "PUBLIC";
export type MediaFormat = "webp" | "avif";

export type MediaRecipe = Readonly<{
  version: string;
  acceptedMimeTypes: readonly ["image/jpeg", "image/png", "image/webp"];
  maximumBytes: number;
  maximumVariantBytes: number;
  maximumTotalVariantBytes: number;
  maximumEdgePixels: number;
  maximumPixels: number;
  uploadGrantTtlSeconds: number;
  widths: readonly [640, 1280];
  webpQuality: 82;
  avifQuality: 55;
  allowCrop: false;
  allowUpscale: false;
}>;

export const PROPERTY_V1_RECIPE = Object.freeze({
  version: "property-v1",
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maximumBytes: 15 * 1024 * 1024,
  maximumVariantBytes: 15 * 1024 * 1024,
  maximumTotalVariantBytes: 15 * 1024 * 1024,
  maximumEdgePixels: 12_000,
  maximumPixels: 50_000_000,
  uploadGrantTtlSeconds: 5 * 60,
  widths: [640, 1280],
  webpQuality: 82,
  avifQuality: 55,
  allowCrop: false,
  allowUpscale: false,
} as const) satisfies MediaRecipe;

export type MediaOrderingItem = Readonly<{
  mediaId: string;
  sortOrder: number;
  isCover: boolean;
}>;
