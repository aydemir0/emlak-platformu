import type { PropertyAuthorizationFacts } from "@/application/properties/authorize-property-command";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  PropertyCommandContext,
  StateHistoryEvidence,
} from "@/application/properties/property-contracts";
import type {
  PropertyRecord,
  PropertyState,
} from "@/domain/properties/property";

export type ReferenceIds = Readonly<{
  listingTypeId?: string;
  propertyTypeId?: string;
  locationId?: string;
  heatingTypeId?: string | null;
  advisorId?: string;
}>;

export interface PropertyTransaction {
  loadAuthorizationFacts(
    context: PropertyCommandContext,
  ): Promise<PropertyAuthorizationFacts>;
  isAdvisorAssigned(propertyId: string, advisorId: string): Promise<boolean>;
  getProperty(
    propertyId: string,
    options: { lock: boolean },
  ): Promise<PropertyRecord | null>;
  referencesExist(references: ReferenceIds): Promise<boolean>;
  getPublicationReadiness(propertyId: string): Promise<{
    canonicalRouteReady: boolean;
    publicFactsReady: boolean;
    mediaReady: boolean;
  }>;
  insertProperty(values: Record<string, unknown>): Promise<PropertyRecord>;
  updateProperty(
    propertyId: string,
    expectedVersion: bigint,
    patch: Record<string, unknown>,
  ): Promise<boolean>;
  insertPriceHistory(values: Record<string, unknown>): Promise<void>;
  insertStateHistory(
    values: StateHistoryEvidence & Record<string, unknown>,
  ): Promise<void>;
  insertAdvisorAssignment(values: Record<string, unknown>): Promise<void>;
  insertAuditLog(values: Record<string, unknown>): Promise<void>;
  insertOutboxMessage(values: Record<string, unknown>): Promise<void>;
}

export interface PropertyUnitOfWork {
  transaction<T>(work: (tx: PropertyTransaction) => Promise<T>): Promise<T>;
  recordDeniedCommand(
    context: PropertyCommandContext,
    propertyId: string,
    action: string,
    reasonCode: string,
  ): Promise<void>;
}

export type PropertyListItem = Readonly<{
  id: string;
  publicId: string;
  title: string;
  state: PropertyState;
  listingTypeLabel: string;
  propertyTypeLabel: string;
  locationName: string;
  priceAmountMinor: bigint | null;
  currencyCode: string | null;
  version: bigint;
  advisorNames: readonly string[];
  updatedAt: Date;
}>;

export type PropertyListQuery = Readonly<{
  limit: number;
  offset: number;
  status?: PropertyState;
  listingTypeId?: string;
  advisorId?: string;
  locationId?: string;
  search?: string;
  sort?: "updated_desc" | "updated_asc" | "price_desc" | "price_asc";
}>;

export interface PropertyReadRepository {
  list(
    actor: StaffPrincipal,
    input: PropertyListQuery,
  ): Promise<{ items: PropertyListItem[]; total: number }>;
  get(
    actor: StaffPrincipal,
    propertyId: string,
  ): Promise<PropertyRecord | null>;
  getReferenceData(): Promise<{
    listingTypes: ReadonlyArray<{ id: string; label: string }>;
    propertyTypes: ReadonlyArray<{ id: string; label: string }>;
    locations: ReadonlyArray<{
      id: string;
      name: string;
      level: "CITY" | "DISTRICT" | "NEIGHBORHOOD";
      parentId: string | null;
    }>;
    heatingTypes: ReadonlyArray<{ id: string; label: string }>;
    advisors: ReadonlyArray<{ id: string; name: string }>;
  }>;
}
