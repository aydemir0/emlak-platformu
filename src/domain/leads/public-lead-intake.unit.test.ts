import { describe, expect, it } from "vitest";

import {
  parsePublicLeadForm,
  publicLeadAnalyticsPayload,
} from "@/domain/leads/public-lead-intake";

describe("public lead intake contract", () => {
  it("accepts phone-only and email-only form contracts", () => {
    const phoneOnly = parsePublicLeadForm({
      propertyId: "property-public-id",
      phone: "+90 555 000 00 00",
      consentAccepted: "on",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    });
    expect(phoneOnly).toMatchObject({ phone: "+90 555 000 00 00" });
    expect(phoneOnly).not.toHaveProperty("email");
    const emailOnly = parsePublicLeadForm({
      propertyId: "property-public-id",
      email: "person@example.test",
      consentAccepted: "on",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    });
    expect(emailOnly).toMatchObject({ email: "person@example.test" });
    expect(emailOnly).not.toHaveProperty("phone");
  });

  it("rejects missing contact and unknown request-controlled identities", () => {
    expect(() =>
      parsePublicLeadForm({
        propertyId: "property-public-id",
        consentAccepted: "on",
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
      }),
    ).toThrow("LEAD_VALIDATION_FAILED");
    expect(() =>
      parsePublicLeadForm({
        propertyId: "property-public-id",
        email: "person@example.test",
        consentAccepted: "on",
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
        advisorId: "attacker",
      }),
    ).toThrow("LEAD_VALIDATION_FAILED");
  });

  it("builds analytics contracts without PII or lead identifiers", () => {
    expect(
      publicLeadAnalyticsPayload({
        source: "property_detail",
        duplicateCandidateDetected: true,
      }),
    ).toEqual({ source: "property_detail", duplicateCandidateDetected: true });
  });
});
