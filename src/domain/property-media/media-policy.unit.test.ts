import { describe, expect, it } from "vitest";

import {
  assertCompleteOrdering,
  isPublicEligible,
  selectVariantWidths,
} from "@/domain/property-media/media-policy";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";

describe("property media policy", () => {
  it("keeps READY separate from current public eligibility", () => {
    const base = {
      mediaState: "READY" as const,
      visibility: "PUBLIC" as const,
      mediaDeleted: false,
      propertyState: "ACTIVE" as const,
      propertyDeleted: false,
      currentSourceVersion: true,
      deliveryDenied: false,
    };
    expect(isPublicEligible(base)).toBe(true);
    expect(isPublicEligible({ ...base, visibility: "PRIVATE" })).toBe(false);
    expect(isPublicEligible({ ...base, mediaState: "FAILED" })).toBe(false);
    expect(isPublicEligible({ ...base, deliveryDenied: true })).toBe(false);
  });

  it("does not upscale beyond the normalized source width", () => {
    expect(selectVariantWidths(500, PROPERTY_V1_RECIPE)).toEqual([500]);
    expect(selectVariantWidths(900, PROPERTY_V1_RECIPE)).toEqual([640, 900]);
    expect(selectVariantWidths(2000, PROPERTY_V1_RECIPE)).toEqual([640, 1280]);
  });

  it("requires the complete dense active set and exactly one cover", () => {
    const active = ["m1", "m2"];
    expect(() =>
      assertCompleteOrdering(active, [
        { mediaId: "m2", sortOrder: 1, isCover: true },
        { mediaId: "m1", sortOrder: 2, isCover: false },
      ]),
    ).not.toThrow();
    expect(() =>
      assertCompleteOrdering(active, [
        { mediaId: "m1", sortOrder: 1, isCover: false },
      ]),
    ).toThrow("MEDIA_CONFLICT");
    expect(() =>
      assertCompleteOrdering(active, [
        { mediaId: "m1", sortOrder: 1, isCover: true },
        { mediaId: "m2", sortOrder: 2, isCover: true },
      ]),
    ).toThrow("MEDIA_VALIDATION_FAILED");
  });
});
