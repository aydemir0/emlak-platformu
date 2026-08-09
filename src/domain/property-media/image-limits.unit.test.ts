import { describe, expect, it } from "vitest";

import { assertDecodedImageLimits } from "@/domain/property-media/media-policy";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";

describe("decoded image resource limits", () => {
  it("rejects a decompression-bomb pixel count independently of byte size", () => {
    expect(() =>
      assertDecodedImageLimits(
        { width: 10_000, height: 5_001, pages: 1 },
        PROPERTY_V1_RECIPE,
      ),
    ).toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("rejects animation and accepts a bounded static image", () => {
    expect(() =>
      assertDecodedImageLimits(
        { width: 800, height: 600, pages: 2 },
        PROPERTY_V1_RECIPE,
      ),
    ).toThrow("MEDIA_VALIDATION_FAILED");
    expect(() =>
      assertDecodedImageLimits(
        { width: 800, height: 600, pages: 1 },
        PROPERTY_V1_RECIPE,
      ),
    ).not.toThrow();
  });
});
