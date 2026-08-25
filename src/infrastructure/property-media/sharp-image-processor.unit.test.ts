import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import { SharpImageProcessor } from "@/infrastructure/property-media/sharp-image-processor.server";

async function image(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp" = "jpeg",
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 80, b: 140 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

describe("Sharp property image processor", () => {
  it("decodes a valid JPEG and emits verified WebP and AVIF candidates", async () => {
    const source = await image(1400, 900);
    const result = await new SharpImageProcessor().process(
      source,
      "image/jpeg",
      PROPERTY_V1_RECIPE,
    );
    expect(result.detectedMimeType).toBe("image/jpeg");
    expect(result.width).toBe(1400);
    expect(result.height).toBe(900);
    expect(
      result.variants.map((variant) => [
        variant.width,
        variant.format,
        variant.mimeType,
      ]),
    ).toEqual([
      [640, "webp", "image/webp"],
      [640, "avif", "image/avif"],
      [1280, "webp", "image/webp"],
      [1280, "avif", "image/avif"],
    ]);
    for (const variant of result.variants) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("rejects a forged declared MIME and active SVG content", async () => {
    const jpeg = await image(20, 20);
    const processor = new SharpImageProcessor();
    await expect(
      processor.process(jpeg, "image/png", PROPERTY_V1_RECIPE),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
    await expect(
      processor.process(
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
        ),
        "image/jpeg",
        PROPERTY_V1_RECIPE,
      ),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("rejects oversized bytes before decode", async () => {
    const oversized = new Uint8Array(PROPERTY_V1_RECIPE.maximumBytes + 1);
    await expect(
      new SharpImageProcessor().process(
        oversized,
        "image/jpeg",
        PROPERTY_V1_RECIPE,
      ),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("rejects encoded output that exceeds the per-variant recipe budget", async () => {
    const source = await image(20, 20);
    await expect(
      new SharpImageProcessor().process(source, "image/jpeg", {
        ...PROPERTY_V1_RECIPE,
        maximumVariantBytes: 1,
      }),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("rejects encoded output that exceeds the aggregate recipe budget", async () => {
    const source = await image(20, 20);
    await expect(
      new SharpImageProcessor().process(source, "image/jpeg", {
        ...PROPERTY_V1_RECIPE,
        maximumVariantBytes: PROPERTY_V1_RECIPE.maximumBytes,
        maximumTotalVariantBytes: 1,
      }),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("rejects an extreme decoded edge", async () => {
    const extreme = await image(12_001, 1, "png");
    await expect(
      new SharpImageProcessor().process(
        extreme,
        "image/png",
        PROPERTY_V1_RECIPE,
      ),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("normalizes EXIF orientation and strips EXIF/GPS metadata", async () => {
    const source = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: "red",
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Copyright: "private" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "41/1 0/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "29/1 0/1 0/1",
        },
      })
      .toBuffer();
    const result = await new SharpImageProcessor().process(
      source,
      "image/jpeg",
      PROPERTY_V1_RECIPE,
    );
    expect([result.width, result.height]).toEqual([20, 40]);
    for (const variant of result.variants) {
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("clamps the smallest candidate to source width without upscaling", async () => {
    const source = await image(500, 300, "webp");
    const result = await new SharpImageProcessor().process(
      source,
      "image/webp",
      PROPERTY_V1_RECIPE,
    );
    expect(new Set(result.variants.map((variant) => variant.width))).toEqual(
      new Set([500]),
    );
  });
});
