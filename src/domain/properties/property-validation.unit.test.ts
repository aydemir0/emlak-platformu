import { describe, expect, it } from "vitest";

import { validatePropertyDetails } from "@/domain/properties/property-validation";

describe("property details validation", () => {
  it("accepts nullable Phase 5 fields", () => {
    expect(validatePropertyDetails({})).toEqual([]);
  });

  it("enforces paired coordinates and coordinate ranges", () => {
    expect(validatePropertyDetails({ latitude: 41 })).toContain(
      "latitude and longitude must be supplied together",
    );
    expect(validatePropertyDetails({ latitude: 91, longitude: 181 })).toEqual(
      expect.arrayContaining([
        "latitude must be between -90 and 90",
        "longitude must be between -180 and 180",
      ]),
    );
  });

  it("rejects negative values and net area greater than gross area", () => {
    expect(
      validatePropertyDetails({
        grossAreaSqm: 100,
        netAreaSqm: 120,
        livingRoomCount: -1,
        buildingAgeYears: -1,
        totalFloorCount: -1,
      }),
    ).toHaveLength(4);
  });

  it("fails closed while location visibility vocabulary is an Open Decision", () => {
    expect(validatePropertyDetails({ locationVisibility: "EXACT" })).toContain(
      "location visibility is not writable in Phase 5",
    );
  });
});
