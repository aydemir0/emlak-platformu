import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  PropertyDetails,
  PropertyState,
} from "@/domain/properties/property";

export type PropertyCommandContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
}>;

export type CreatePropertyDraftInput = PropertyDetails &
  Readonly<{
    listingTypeId: string;
    propertyTypeId: string;
    locationId: string;
    heatingTypeId?: string | null;
    title: string;
    description?: string | null;
    priceAmountMinor?: bigint | null;
    currencyCode?: string | null;
  }>;

export type UpdatePropertyInput = PropertyDetails &
  Readonly<{
    propertyId: string;
    expectedVersion: bigint;
    title?: string;
    description?: string | null;
    listingTypeId?: string;
    propertyTypeId?: string;
    locationId?: string;
    heatingTypeId?: string | null;
  }>;

export type StateHistoryEvidence = Readonly<{
  reservationReference?: string;
  reservationAdvisorId?: string;
  reservationExpiresAt?: Date;
  closingAmountMinor?: bigint;
  closingCurrencyCode?: string;
  closingDate?: string;
}>;

export type StateCommandInput = StateHistoryEvidence &
  Readonly<{
    propertyId: string;
    expectedVersion: bigint;
    reasonCode: string | null;
  }>;

export type StateChange = Readonly<{
  from: PropertyState;
  to: PropertyState;
  nextVersion: bigint;
}>;
