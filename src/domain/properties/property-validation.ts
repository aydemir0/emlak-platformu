import type { PropertyDetails } from "@/domain/properties/property";

export function validatePropertyDetails(input: PropertyDetails): string[] {
  const errors: string[] = [];
  const hasLatitude = input.latitude !== undefined && input.latitude !== null;
  const hasLongitude =
    input.longitude !== undefined && input.longitude !== null;

  if (hasLatitude !== hasLongitude) {
    errors.push("latitude and longitude must be supplied together");
  }
  if (hasLatitude && (input.latitude! < -90 || input.latitude! > 90)) {
    errors.push("latitude must be between -90 and 90");
  }
  if (hasLongitude && (input.longitude! < -180 || input.longitude! > 180)) {
    errors.push("longitude must be between -180 and 180");
  }
  if (input.grossAreaSqm != null && input.grossAreaSqm < 0) {
    errors.push("gross area must be nonnegative");
  }
  if (input.netAreaSqm != null && input.netAreaSqm < 0) {
    errors.push("net area must be nonnegative");
  }
  if (
    input.netAreaSqm != null &&
    input.grossAreaSqm != null &&
    input.netAreaSqm > input.grossAreaSqm
  ) {
    errors.push("net area cannot exceed gross area");
  }
  if (input.livingRoomCount != null && input.livingRoomCount < 0) {
    errors.push("living room count must be nonnegative");
  }
  if (input.buildingAgeYears != null && input.buildingAgeYears < 0) {
    errors.push("building age must be nonnegative");
  }
  if (input.totalFloorCount != null && input.totalFloorCount < 0) {
    errors.push("total floor count must be nonnegative");
  }
  if (input.locationVisibility != null) {
    errors.push("location visibility is not writable in Phase 5");
  }
  return errors;
}
