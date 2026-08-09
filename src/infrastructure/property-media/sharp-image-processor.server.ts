import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { ApplicationError } from "@/application/errors/application-error";
import type {
  ImageProcessor,
  ProcessedVariant,
} from "@/application/property-media/image-processor";
import type { MediaFormat, MediaRecipe } from "@/domain/property-media/media";
import {
  assertDecodedImageLimits,
  selectVariantWidths,
} from "@/domain/property-media/media-policy";

const FORMAT_TO_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validationFailure(cause?: unknown): ApplicationError {
  return new ApplicationError(
    "MEDIA_VALIDATION_FAILED",
    "MEDIA_VALIDATION_FAILED",
    cause instanceof Error ? { cause } : {},
  );
}

export class SharpImageProcessor implements ImageProcessor {
  async process(
    source: Uint8Array,
    declaredMimeType: string,
    recipe: MediaRecipe,
  ) {
    if (
      source.byteLength === 0 ||
      source.byteLength > recipe.maximumBytes ||
      !recipe.acceptedMimeTypes.includes(
        declaredMimeType as (typeof recipe.acceptedMimeTypes)[number],
      )
    ) {
      throw validationFailure();
    }

    try {
      const options = {
        failOn: "error" as const,
        sequentialRead: true,
        limitInputPixels: recipe.maximumPixels,
        animated: false,
        pages: 1,
      };
      const metadata = await sharp(source, options).metadata();
      const detectedMimeType =
        metadata.format &&
        metadata.format in FORMAT_TO_MIME &&
        FORMAT_TO_MIME[metadata.format as keyof typeof FORMAT_TO_MIME];
      if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
        throw validationFailure();
      }
      const autoWidth = metadata.autoOrient?.width ?? metadata.width;
      const autoHeight = metadata.autoOrient?.height ?? metadata.height;
      if (!autoWidth || !autoHeight) throw validationFailure();
      assertDecodedImageLimits(
        {
          width: autoWidth,
          height: autoHeight,
          pages: metadata.pages ?? 1,
        },
        recipe,
      );

      const variants: ProcessedVariant[] = [];
      for (const width of selectVariantWidths(autoWidth, recipe)) {
        for (const format of ["webp", "avif"] as const) {
          variants.push(
            await this.createVariant(source, options, width, format, recipe),
          );
        }
      }
      return {
        detectedMimeType,
        width: autoWidth,
        height: autoHeight,
        byteSize: source.byteLength,
        checksumSha256: digest(source),
        processorVersion: `sharp-${sharp.versions.sharp}-libvips-${sharp.versions.vips}`,
        variants,
      };
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === "MEDIA_VALIDATION_FAILED"
      ) {
        throw error;
      }
      throw validationFailure(error);
    }
  }

  private async createVariant(
    source: Uint8Array,
    options: {
      failOn: "error";
      sequentialRead: boolean;
      limitInputPixels: number;
      animated: boolean;
      pages: number;
    },
    width: number,
    format: MediaFormat,
    recipe: MediaRecipe,
  ): Promise<ProcessedVariant> {
    let pipeline = sharp(source, options)
      .autoOrient()
      .resize({ width, fit: "inside", withoutEnlargement: true });
    pipeline =
      format === "webp"
        ? pipeline.webp({ quality: recipe.webpQuality })
        : pipeline.avif({ quality: recipe.avifQuality });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const outputMetadata = await sharp(data, {
      failOn: "error",
      limitInputPixels: recipe.maximumPixels,
    }).metadata();
    const expectedOutputFormat = format === "avif" ? "heif" : format;
    const expectedMediaType = format === "webp" ? "image/webp" : "image/avif";
    if (
      outputMetadata.format !== expectedOutputFormat ||
      outputMetadata.mediaType !== expectedMediaType ||
      outputMetadata.width !== info.width ||
      outputMetadata.height !== info.height ||
      outputMetadata.exif ||
      outputMetadata.icc ||
      outputMetadata.orientation
    ) {
      throw validationFailure();
    }
    return {
      format,
      mimeType: expectedMediaType,
      width: info.width,
      height: info.height,
      bytes: data,
      checksumSha256: digest(data),
    };
  }
}
