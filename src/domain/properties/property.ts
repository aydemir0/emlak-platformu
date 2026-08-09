export const PROPERTY_STATES = [
  "DRAFT",
  "REVIEW",
  "ACTIVE",
  "RESERVED",
  "SOLD",
  "RENTED",
  "PASSIVE",
  "ARCHIVED",
] as const;

export type PropertyState = (typeof PROPERTY_STATES)[number];

export type PropertyDetails = Readonly<{
  shortDescription?: string | null;
  grossAreaSqm?: number | null;
  netAreaSqm?: number | null;
  livingRoomCount?: number | null;
  bedroomCount?: number | null;
  bathroomCount?: number | null;
  buildingAgeYears?: number | null;
  floorNumber?: number | null;
  totalFloorCount?: number | null;
  furnished?: boolean | null;
  addressLine?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationVisibility?: string | null;
}>;

export type PropertyRecord = PropertyDetails &
  Readonly<{
    id: string;
    publicId: string;
    listingTypeId: string;
    propertyTypeId: string;
    locationId: string;
    heatingTypeId: string | null;
    title: string;
    description: string | null;
    currentState: PropertyState;
    priceAmountMinor: bigint | null;
    currencyCode: string | null;
    version: bigint;
    publishedAt: Date | null;
    deletedAt: Date | null;
    updatedAt?: Date;
  }>;
