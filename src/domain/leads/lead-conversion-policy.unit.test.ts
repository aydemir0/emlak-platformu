import { describe, expect, it } from "vitest";

import {
  conversionEligibility,
  mapLeadToInitialRequest,
  normalizeConversionEmail,
  normalizeConversionPhone,
  resolveCustomerIdentity,
} from "@/domain/leads/lead-conversion-policy";

describe("lead conversion policy", () => {
  it("normalizes only valid conservative email and international phone values", () => {
    expect(normalizeConversionEmail(" Person@Example.test ")).toBe(
      "person@example.test",
    );
    expect(normalizeConversionPhone(" +90 555 000 00 00 ")).toBe(
      "+905550000000",
    );
    expect(() => normalizeConversionEmail("person")).toThrow(
      "INVALID_LEAD_IDENTITY",
    );
    expect(() => normalizeConversionPhone("05550000000")).toThrow(
      "INVALID_LEAD_IDENTITY",
    );
  });
  it("resolves unique customer identity by distinct customer rather than contact-row count", () => {
    expect(resolveCustomerIdentity({ candidates: [] })).toEqual({
      kind: "CREATE_NEW_CUSTOMER",
    });
    expect(
      resolveCustomerIdentity({
        candidates: [
          {
            identity: { channel: "EMAIL", normalizedValue: "a@example.test" },
            customerId: "a",
          },
          {
            identity: { channel: "PHONE", normalizedValue: "+905550000000" },
            customerId: "a",
          },
        ],
      }),
    ).toEqual({ kind: "LINK_EXISTING_CUSTOMER", customerId: "a" });
    expect(
      resolveCustomerIdentity({
        candidates: [
          {
            identity: { channel: "EMAIL", normalizedValue: "a@example.test" },
            customerId: "a",
          },
          {
            identity: { channel: "PHONE", normalizedValue: "+905550000000" },
            customerId: "b",
          },
        ],
      }),
    ).toEqual({ kind: "IDENTITY_CONFLICT" });
  });
  it("keeps idempotent outcome and integrity conflict distinct", () => {
    expect(
      conversionEligibility({ leadStatus: "QUALIFIED", hasConversion: false }),
    ).toEqual({ kind: "NEW_CONVERSION_REQUIRED" });
    expect(
      conversionEligibility({ leadStatus: "WON", hasConversion: true }),
    ).toEqual({ kind: "EXISTING_CONVERSION_OUTCOME" });
    expect(
      conversionEligibility({ leadStatus: "WON", hasConversion: false }),
    ).toEqual({ kind: "INTEGRITY_CONFLICT" });
    expect(
      conversionEligibility({ leadStatus: "NEW", hasConversion: false }),
    ).toEqual({ kind: "NOT_ALLOWED" });
  });
  it("does not fabricate a request profile from a lead message or property interest", () => {
    expect(mapLeadToInitialRequest()).toEqual({
      listingType: { state: "MISSING" },
      location: { state: "MISSING" },
      budget: { state: "MISSING" },
      propertyType: { state: "MISSING" },
      rooms: { state: "MISSING" },
      netArea: { state: "MISSING" },
      features: { state: "MISSING" },
    });
  });
});
