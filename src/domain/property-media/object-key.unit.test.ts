import { describe, expect, it } from "vitest";

import {
  buildOriginalKey,
  buildQuarantineKey,
  buildVariantKey,
} from "@/domain/property-media/object-key";

const propertyId = "10000000-0000-4000-8000-000000000001";
const mediaId = "20000000-0000-4000-8000-000000000002";

describe("property media object keys", () => {
  it("builds deterministic private keys from controlled UUID segments", () => {
    expect(buildQuarantineKey(propertyId, mediaId, 1)).toBe(
      `private/quarantine/properties/${propertyId}/${mediaId}/1/source`,
    );
    expect(buildOriginalKey(propertyId, mediaId, 2)).toBe(
      `private/originals/properties/${propertyId}/${mediaId}/2/source`,
    );
  });

  it("builds immutable delivery keys without a filename or slug", () => {
    expect(
      buildVariantKey({
        propertyId,
        mediaId,
        sourceVersion: 3,
        recipeVersion: "property-v1",
        width: 1280,
        format: "avif",
      }),
    ).toBe(
      `delivery/properties/${propertyId}/${mediaId}/3/property-v1/1280.avif`,
    );
  });

  it("rejects traversal-like identifiers and uncontrolled recipe segments", () => {
    expect(() => buildQuarantineKey("../property", mediaId, 1)).toThrow(
      "MEDIA_VALIDATION_FAILED",
    );
    expect(() =>
      buildVariantKey({
        propertyId,
        mediaId,
        sourceVersion: 1,
        recipeVersion: "../recipe",
        width: 640,
        format: "webp",
      }),
    ).toThrow("MEDIA_VALIDATION_FAILED");
  });
});
