import { ApplicationError } from "@/application/errors/application-error";
import {
  assertUpdated,
  executeAuditedPropertyCommand,
  loadAuthorizedProperty,
  writeAuditAndOutbox,
} from "@/application/properties/property-command-helpers";
import type {
  PropertyCommandContext,
  UpdatePropertyInput,
} from "@/application/properties/property-contracts";
import type { PropertyUnitOfWork } from "@/application/properties/property-ports";
import { validatePropertyDetails } from "@/domain/properties/property-validation";

export async function updateProperty(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: UpdatePropertyInput,
): Promise<void> {
  const errors = validatePropertyDetails(input);
  if (errors.length) {
    throw new ApplicationError("PROPERTY_VALIDATION_FAILED", errors.join("; "));
  }
  await executeAuditedPropertyCommand(
    uow,
    context,
    input.propertyId,
    "property.update",
    async (tx) => {
      const property = await loadAuthorizedProperty(
        tx,
        context,
        input.propertyId,
        "update",
      );
      const references = {
        listingTypeId: input.listingTypeId,
        propertyTypeId: input.propertyTypeId,
        locationId: input.locationId,
        heatingTypeId: input.heatingTypeId,
      };
      if (!(await tx.referencesExist(references))) {
        throw new ApplicationError(
          "PROPERTY_REFERENCE_DATA_MISSING",
          "PROPERTY_REFERENCE_DATA_MISSING",
        );
      }
      const {
        propertyId,
        expectedVersion,
        locationVisibility: _blocked,
        ...patch
      } = input;
      void _blocked;
      const updated = await tx.updateProperty(
        propertyId,
        expectedVersion,
        patch,
      );
      assertUpdated(updated);
      await writeAuditAndOutbox(
        tx,
        context,
        propertyId,
        "property.updated",
        property.version + 1n,
      );
    },
  );
}
