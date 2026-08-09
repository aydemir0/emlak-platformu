import { ApplicationError } from "@/application/errors/application-error";
import { changePropertyState } from "@/application/properties/change-property-state";
import {
  assertExpectedVersion,
  assertUpdated,
  executeAuditedPropertyCommand,
  loadAuthorizedProperty,
  writeAuditAndOutbox,
} from "@/application/properties/property-command-helpers";
import type {
  PropertyCommandContext,
  StateCommandInput,
} from "@/application/properties/property-contracts";
import type { PropertyUnitOfWork } from "@/application/properties/property-ports";

export const submitPropertyForReview = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "REVIEW");

export const publishProperty = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "ACTIVE", "publish");

export const unpublishProperty = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "REVIEW", "unpublish");

export const reserveProperty = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "RESERVED");

export const markPropertySold = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "SOLD");

export const markPropertyRented = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "RENTED");

export const archiveProperty = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "ARCHIVED");

export const restoreProperty = (
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
) => changePropertyState(uow, context, input, "DRAFT", "restore");

export async function softDeleteProperty(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: Pick<
    StateCommandInput,
    "propertyId" | "expectedVersion" | "reasonCode"
  >,
): Promise<void> {
  await executeAuditedPropertyCommand(
    uow,
    context,
    input.propertyId,
    "property.delete",
    async (tx) => {
      const property = await loadAuthorizedProperty(
        tx,
        context,
        input.propertyId,
        "delete",
        true,
      );
      assertExpectedVersion(property, input.expectedVersion);
      if (property.deletedAt) {
        throw new ApplicationError("PROPERTY_CONFLICT", "PROPERTY_CONFLICT");
      }
      const nextVersion = property.version + 1n;
      assertUpdated(
        await tx.updateProperty(property.id, input.expectedVersion, {
          deletedAt: new Date(),
        }),
      );
      await writeAuditAndOutbox(
        tx,
        context,
        property.id,
        "property.deleted",
        nextVersion,
      );
    },
  );
}
