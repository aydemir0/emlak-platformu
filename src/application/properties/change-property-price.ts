import { ApplicationError } from "@/application/errors/application-error";
import {
  assertExpectedVersion,
  assertUpdated,
  executeAuditedPropertyCommand,
  loadAuthorizedProperty,
  writeAuditAndOutbox,
} from "@/application/properties/property-command-helpers";
import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import type { PropertyUnitOfWork } from "@/application/properties/property-ports";

export async function changePropertyPrice(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: Readonly<{
    propertyId: string;
    expectedVersion: bigint;
    amountMinor: bigint;
    currencyCode: string;
    effectiveAt: Date;
    source: string;
    reasonCode: string | null;
  }>,
): Promise<void> {
  if (input.amountMinor < 0n || !/^[A-Z]{3}$/.test(input.currencyCode)) {
    throw new ApplicationError(
      "PROPERTY_VALIDATION_FAILED",
      "PROPERTY_VALIDATION_FAILED",
    );
  }
  await executeAuditedPropertyCommand(
    uow,
    context,
    input.propertyId,
    "property.price_change",
    async (tx) => {
      const property = await loadAuthorizedProperty(
        tx,
        context,
        input.propertyId,
        "price",
      );
      assertExpectedVersion(property, input.expectedVersion);
      const nextVersion = property.version + 1n;
      assertUpdated(
        await tx.updateProperty(input.propertyId, input.expectedVersion, {
          priceAmountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
        }),
      );
      await tx.insertPriceHistory({
        propertyId: input.propertyId,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        effectiveAt: input.effectiveAt,
        source: input.source,
        propertyVersion: nextVersion,
        changedByUserIdentityId: context.actor.identityId,
        reasonCode: input.reasonCode,
        idempotencyKey: context.idempotencyKey,
      });
      await writeAuditAndOutbox(
        tx,
        context,
        input.propertyId,
        "property.price_changed",
        nextVersion,
      );
    },
  );
}
