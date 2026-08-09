import { describe, expect, it } from "vitest";

import { parsePropertyForm } from "@/features/properties/property-form-schema";

const valid = {
  listingTypeId: "30000000-0000-4000-8000-000000000001",
  propertyTypeId: "93000000-0000-4000-8000-000000000001",
  locationId: "94000000-0000-4000-8000-000000000001",
  title: "Property",
  priceAmountMinor: "1250000",
  currencyCode: "TRY",
};

describe("property form parsing", () => {
  it("coerces approved optional fields without inventing vocabulary", () => {
    expect(
      parsePropertyForm({
        ...valid,
        furnished: "true",
        grossAreaSqm: "120.50",
        heatingTypeId: "",
      }),
    ).toMatchObject({
      furnished: true,
      grossAreaSqm: 120.5,
      heatingTypeId: null,
      priceAmountMinor: 1_250_000n,
    });
  });

  it("rejects location visibility writes and negative numeric values", () => {
    expect(() =>
      parsePropertyForm({ ...valid, locationVisibility: "EXACT" }),
    ).toThrow();
    expect(() => parsePropertyForm({ ...valid, grossAreaSqm: "-1" })).toThrow();
  });

  it("does not accept user-controlled advisor ownership fields", () => {
    expect(
      parsePropertyForm({
        ...valid,
        advisorId: "92000000-0000-4000-8000-000000000002",
      }),
    ).not.toHaveProperty("advisorId");
  });
});
