import { describe, expect, it } from "vitest";
import {
  compareMatchesV2,
  MatchingInputError,
  matchingFingerprintV2,
  scoreMatchingV2,
  type MatchingProfileV2,
  type PropertyMatchCandidateV2,
} from "./matching-engine-v2";

const profile = (
  overrides: Partial<MatchingProfileV2> = {},
): MatchingProfileV2 => ({
  listingTypeId: "SALE",
  location: {
    mode: "CONSTRAINED",
    value: { cityId: "city", districtId: "district" },
  },
  budget: {
    mode: "CONSTRAINED",
    value: { min: 100n, max: 200n, currencyCode: "TRY" },
  },
  propertyTypes: { mode: "CONSTRAINED", value: ["flat"] },
  rooms: { mode: "CONSTRAINED", value: { min: 2n, max: 3n } },
  netAreaDeciSqm: { mode: "CONSTRAINED", value: { min: 800n, max: 1000n } },
  features: {
    mode: "CONSTRAINED",
    value: {
      preferred: ["balcony", "parking"],
      required: ["elevator"],
      avoided: [],
    },
  },
  ...overrides,
});
const candidate = (
  overrides: Partial<PropertyMatchCandidateV2> = {},
): PropertyMatchCandidateV2 => ({
  id: "00000000-0000-0000-0000-000000000001",
  listingTypeId: "SALE",
  cityId: "city",
  districtId: "district",
  priceAmountMinor: 150n,
  currencyCode: "TRY",
  propertyTypeId: "flat",
  bedroomCount: 2n,
  netAreaDeciSqm: 900n,
  featureIds: ["elevator", "balcony", "parking"],
  ...overrides,
});
const matched = (p = profile(), c = candidate()) => {
  const result = scoreMatchingV2(p, c);
  expect(result.status).toBe("MATCHED");
  if (result.status === "REJECTED") throw new Error("unexpected rejection");
  return result;
};

describe("matching-v2", () => {
  it("returns a perfect deterministic score", () =>
    expect(matched().totalScore).toBe(100));
  it.each([
    [
      "listing type",
      candidate({ listingTypeId: "RENT" }),
      "LISTING_TYPE_MISMATCH",
    ],
    [
      "required feature",
      candidate({ featureIds: [] }),
      "REQUIRED_FEATURE_MISSING",
    ],
  ] as const)("rejects %s hard constraint", (_, c, reason) => {
    const r = scoreMatchingV2(profile(), c);
    expect(r).toMatchObject({ status: "REJECTED", reason });
  });
  it.each([
    [candidate(), 30],
    [candidate({ districtId: "other" }), 18],
    [candidate({ cityId: "other" }), 0],
    [candidate({ cityId: undefined }), 0],
  ] as const)("scores location %i", (c, points) =>
    expect(matched(profile(), c).components.location).toBe(points),
  );
  it("treats city-only preference as exact city", () =>
    expect(
      matched(
        profile({
          location: { mode: "CONSTRAINED", value: { cityId: "city" } },
        }),
      ).components.location,
    ).toBe(30));
  it.each([
    [100n, 25],
    [200n, 25],
    [99n, 22],
    [201n, 23],
    [190n, 25],
    [220n, 0],
    [221n, 0],
    [0n, 0],
  ] as const)("scores budget %s deterministically", (price, points) =>
    expect(
      matched(profile(), candidate({ priceAmountMinor: price })).components
        .budget,
    ).toBe(points),
  );
  it.each([
    [candidate({ currencyCode: "USD" }), "BUDGET_CURRENCY_MISMATCH"],
    [
      candidate({ priceAmountMinor: undefined }),
      "BUDGET_PROPERTY_DATA_MISSING",
    ],
  ] as const)("reports budget input safely", (c, code) =>
    expect(matched(profile(), c).reasons[1]?.code).toBe(code),
  );
  it.each([
    [2n, 10],
    [3n, 10],
    [1n, 5],
    [4n, 5],
    [0n, 0],
    [5n, 0],
  ] as const)("scores room distance %s", (bedrooms, points) =>
    expect(
      matched(profile(), candidate({ bedroomCount: bedrooms })).components
        .rooms,
    ).toBe(points),
  );
  it.each([
    [800n, 10],
    [1000n, 10],
    [799n, 9],
    [1100n, 0],
    [1101n, 0],
  ] as const)("scores net area %s", (area, points) =>
    expect(
      matched(profile(), candidate({ netAreaDeciSqm: area })).components
        .netArea,
    ).toBe(points),
  );
  it.each([
    [["elevator", "balcony", "parking"], 10],
    [["elevator", "balcony"], 5],
    [["elevator"], 0],
    [["elevator", "balcony", "parking", "extra"], 10],
  ] as const)("scores feature set overlap", (featureIds, points) =>
    expect(
      matched(profile(), candidate({ featureIds })).components.features,
    ).toBe(points),
  );
  it("deduplicates feature IDs and applies avoided features without rejecting", () => {
    const p = profile({
      features: {
        mode: "CONSTRAINED",
        value: {
          required: ["elevator", "elevator"],
          preferred: ["balcony", "balcony"],
          avoided: ["pets"],
        },
      },
    });
    expect(
      matched(p, candidate({ featureIds: ["elevator", "balcony", "pets"] }))
        .components.features,
    ).toBe(0);
  });
  it("rejects contradictory feature configuration", () =>
    expect(() =>
      matched(
        profile({
          features: {
            mode: "CONSTRAINED",
            value: { required: ["x"], preferred: ["x"], avoided: [] },
          },
        }),
      ),
    ).toThrow(MatchingInputError));
  it("makes missing and flexible preferences neutral", () => {
    const neutral = { mode: "MISSING" } as const;
    const p = profile({
      location: neutral,
      budget: neutral,
      propertyTypes: neutral,
      rooms: neutral,
      netAreaDeciSqm: neutral,
      features: neutral,
    });
    expect(
      matched(
        p,
        candidate({
          priceAmountMinor: undefined,
          cityId: undefined,
          propertyTypeId: undefined,
          bedroomCount: undefined,
          netAreaDeciSqm: undefined,
        }),
      ).totalScore,
    ).toBe(100);
  });
  it.each([
    () =>
      profile({
        budget: {
          mode: "CONSTRAINED",
          value: { min: 2n, max: 1n, currencyCode: "TRY" },
        },
      }),
    () =>
      profile({ rooms: { mode: "CONSTRAINED", value: { min: 2n, max: 1n } } }),
    () =>
      profile({
        netAreaDeciSqm: { mode: "CONSTRAINED", value: { min: 2n, max: 1n } },
      }),
  ])("rejects inverted ranges", (make) =>
    expect(() => scoreMatchingV2(make(), candidate())).toThrow(
      MatchingInputError,
    ),
  );
  it("rejects invalid currencies and negative values", () => {
    expect(() =>
      scoreMatchingV2(
        profile({
          budget: {
            mode: "CONSTRAINED",
            value: { min: 0n, currencyCode: "try" },
          },
        }),
        candidate(),
      ),
    ).toThrow(MatchingInputError);
    expect(() =>
      scoreMatchingV2(profile(), candidate({ priceAmountMinor: -1n })),
    ).toThrow(MatchingInputError);
  });
  it("is stable for repeats, reordered sets, and fingerprints", () => {
    const first = matched();
    const reordered = candidate({
      featureIds: ["parking", "elevator", "balcony"],
    });
    expect(scoreMatchingV2(profile(), reordered)).toEqual(first);
    expect(matchingFingerprintV2(profile(), candidate())).toBe(
      matchingFingerprintV2(profile(), reordered),
    );
    expect(matchingFingerprintV2(profile(), candidate())).not.toBe(
      matchingFingerprintV2(
        profile({ rooms: { mode: "CONSTRAINED", value: { min: 3n } } }),
        candidate(),
      ),
    );
  });
  it("uses component vector then property ID for deterministic ties", () => {
    const first = matched(
      profile({ budget: { mode: "MISSING" } }),
      candidate({ id: "a" }),
    );
    const second = matched(
      profile({ budget: { mode: "MISSING" } }),
      candidate({ id: "b" }),
    );
    expect(compareMatchesV2(first, second)).toBe(-1);
    expect(compareMatchesV2(first, first)).toBe(0);
  });
  it("keeps every valid score bounded for adversarial values", () => {
    for (const value of [0n, 1n, 10n ** 30n]) {
      const result = matched(
        profile({
          budget: {
            mode: "CONSTRAINED",
            value: { min: 0n, max: value, currencyCode: "TRY" },
          },
          netAreaDeciSqm: {
            mode: "CONSTRAINED",
            value: { min: 0n, max: value },
          },
        }),
        candidate({ priceAmountMinor: value, netAreaDeciSqm: value }),
      );
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      Object.values(result.components).forEach((points) =>
        expect(points).toBeGreaterThanOrEqual(0),
      );
    }
  });
  it("does not coerce huge room distances through floating point", () => {
    expect(
      matched(profile(), candidate({ bedroomCount: 10n ** 1000n })).components
        .rooms,
    ).toBe(0);
  });
});
