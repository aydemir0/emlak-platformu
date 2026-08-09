import type { PropertyState } from "@/domain/properties/property";

export const PROPERTY_STATE_TRANSITIONS: Readonly<
  Record<PropertyState, readonly PropertyState[]>
> = {
  DRAFT: ["REVIEW", "ARCHIVED"],
  REVIEW: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["REVIEW", "RESERVED", "PASSIVE", "ARCHIVED"],
  RESERVED: ["ACTIVE", "SOLD", "RENTED", "PASSIVE", "ARCHIVED"],
  PASSIVE: ["REVIEW", "ARCHIVED"],
  SOLD: ["ARCHIVED"],
  RENTED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export function assertPropertyTransition(
  from: PropertyState | string,
  to: PropertyState | string,
): asserts to is PropertyState {
  const allowed = PROPERTY_STATE_TRANSITIONS[from as PropertyState];
  if (!allowed?.includes(to as PropertyState)) {
    throw new Error("PROPERTY_INVALID_TRANSITION");
  }
}
