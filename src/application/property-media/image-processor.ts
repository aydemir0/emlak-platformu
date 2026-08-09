import type { MediaFormat, MediaRecipe } from "@/domain/property-media/media";

export type ProcessedVariant = Readonly<{
  format: MediaFormat;
  mimeType: "image/webp" | "image/avif";
  width: number;
  height: number;
  bytes: Uint8Array;
  checksumSha256: string;
}>;

export type ProcessedImage = Readonly<{
  detectedMimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  byteSize: number;
  checksumSha256: string;
  processorVersion: string;
  variants: readonly ProcessedVariant[];
}>;

export interface ImageProcessor {
  process(
    source: Uint8Array,
    declaredMimeType: string,
    recipe: MediaRecipe,
  ): Promise<ProcessedImage>;
}
