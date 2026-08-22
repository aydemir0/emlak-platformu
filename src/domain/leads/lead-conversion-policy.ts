import type { LeadState } from "@/domain/leads/lead-lifecycle";

export type ConversionPolicyError =
  | "INVALID_LEAD_IDENTITY"
  | "CUSTOMER_IDENTITY_CONFLICT"
  | "LEAD_CONVERSION_NOT_ALLOWED"
  | "LEAD_CONVERSION_INTEGRITY_CONFLICT";

export class LeadConversionPolicyError extends Error {
  constructor(readonly code: ConversionPolicyError) {
    super(code);
    this.name = "LeadConversionPolicyError";
  }
}

export type ContactIdentity = Readonly<{
  channel: "EMAIL" | "PHONE";
  normalizedValue: string;
}>;
export type TrustedIdentityCandidate = Readonly<{
  identity: ContactIdentity;
  customerId: string;
}>;
export type IdentityResolution =
  | Readonly<{ kind: "CREATE_NEW_CUSTOMER" }>
  | Readonly<{ kind: "LINK_EXISTING_CUSTOMER"; customerId: string }>
  | Readonly<{ kind: "IDENTITY_CONFLICT" }>;

export function normalizeConversionEmail(raw: string): string {
  const value = raw.trim().toLocaleLowerCase("en-US");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new LeadConversionPolicyError("INVALID_LEAD_IDENTITY");
  }
  return value;
}

export function normalizeConversionPhone(raw: string): string {
  const value = raw.trim();
  if (!/^\+[0-9 .()-]{6,31}$/.test(value)) {
    throw new LeadConversionPolicyError("INVALID_LEAD_IDENTITY");
  }
  const normalized = `+${value.slice(1).replaceAll(/[^0-9]/g, "")}`;
  if (normalized.length < 8 || normalized.length > 16) {
    throw new LeadConversionPolicyError("INVALID_LEAD_IDENTITY");
  }
  return normalized;
}

export function resolveCustomerIdentity(
  input: Readonly<{
    explicitCustomerId?: string;
    candidates: readonly TrustedIdentityCandidate[];
  }>,
): IdentityResolution {
  if (input.explicitCustomerId) {
    return {
      kind: "LINK_EXISTING_CUSTOMER",
      customerId: input.explicitCustomerId,
    };
  }
  const customers = new Set(
    input.candidates.map((candidate) => candidate.customerId),
  );
  if (customers.size === 0) return { kind: "CREATE_NEW_CUSTOMER" };
  if (customers.size === 1) {
    return { kind: "LINK_EXISTING_CUSTOMER", customerId: [...customers][0]! };
  }
  return { kind: "IDENTITY_CONFLICT" };
}

export type ConversionEligibility =
  | Readonly<{ kind: "NEW_CONVERSION_REQUIRED" }>
  | Readonly<{ kind: "EXISTING_CONVERSION_OUTCOME" }>
  | Readonly<{ kind: "INTEGRITY_CONFLICT" }>
  | Readonly<{ kind: "NOT_ALLOWED" }>;

export function conversionEligibility(
  input: Readonly<{
    leadStatus: LeadState;
    hasConversion: boolean;
  }>,
): ConversionEligibility {
  if (input.hasConversion) return { kind: "EXISTING_CONVERSION_OUTCOME" };
  if (input.leadStatus === "WON") return { kind: "INTEGRITY_CONFLICT" };
  return input.leadStatus === "QUALIFIED" ||
    input.leadStatus === "VIEWING" ||
    input.leadStatus === "NEGOTIATION"
    ? { kind: "NEW_CONVERSION_REQUIRED" }
    : { kind: "NOT_ALLOWED" };
}

export type ProposedInitialRequest = Readonly<{
  listingType: { state: "MISSING" };
  location: { state: "MISSING" };
  budget: { state: "MISSING" };
  propertyType: { state: "MISSING" };
  rooms: { state: "MISSING" };
  netArea: { state: "MISSING" };
  features: { state: "MISSING" };
}>;

// Leads currently expose only property interest, not structured request criteria.
export function mapLeadToInitialRequest(): ProposedInitialRequest {
  const missing = { state: "MISSING" } as const;
  return {
    listingType: missing,
    location: missing,
    budget: missing,
    propertyType: missing,
    rooms: missing,
    netArea: missing,
    features: missing,
  };
}
