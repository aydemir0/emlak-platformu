import { ApplicationError } from "@/application/errors/application-error";
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
import type { PropertyState } from "@/domain/properties/property";
import { assertPropertyTransition } from "@/domain/properties/property-lifecycle";

export async function changePropertyState(
  uow: PropertyUnitOfWork,
  context: PropertyCommandContext,
  input: StateCommandInput,
  target: PropertyState,
  command: "transition" | "publish" | "unpublish" | "restore" = "transition",
): Promise<void> {
  await executeAuditedPropertyCommand(
    uow,
    context,
    input.propertyId,
    `property.transition.${target.toLowerCase()}`,
    async (tx) => {
      const property = await loadAuthorizedProperty(
        tx,
        context,
        input.propertyId,
        command,
        true,
      );
      assertExpectedVersion(property, input.expectedVersion);
      if (command === "restore" && !property.deletedAt) {
        throw new ApplicationError("PROPERTY_CONFLICT", "PROPERTY_CONFLICT");
      }
      assertPropertyTransition(property.currentState, target);

      if (target === "ACTIVE" && command === "publish") {
        const ready = await tx.getPublicationReadiness(property.id);
        if (
          !ready.canonicalRouteReady ||
          !ready.publicFactsReady ||
          !ready.mediaReady
        ) {
          throw new ApplicationError(
            "PROPERTY_VALIDATION_FAILED",
            "publication readiness failed",
          );
        }
      }
      if (
        target === "RESERVED" &&
        (!input.reservationReference ||
          !input.reservationAdvisorId ||
          !input.reservationExpiresAt)
      ) {
        throw new ApplicationError(
          "PROPERTY_VALIDATION_FAILED",
          "reservation evidence is required",
        );
      }
      if (
        (target === "SOLD" || target === "RENTED") &&
        (input.closingAmountMinor == null ||
          !input.closingCurrencyCode ||
          !input.closingDate)
      ) {
        throw new ApplicationError(
          "PROPERTY_VALIDATION_FAILED",
          "closing evidence is required",
        );
      }

      const nextVersion = property.version + 1n;
      const patch: Record<string, unknown> = { currentState: target };
      if (target === "ACTIVE" && command === "publish")
        patch.publishedAt = new Date();
      if (command === "unpublish") patch.publishedAt = null;
      if (command === "restore") patch.deletedAt = null;
      assertUpdated(
        await tx.updateProperty(property.id, input.expectedVersion, patch),
      );
      await tx.insertStateHistory({
        propertyId: property.id,
        fromState: property.currentState,
        toState: target,
        changedByUserIdentityId: context.actor.identityId,
        intentionCode: command,
        reasonCode: input.reasonCode,
        propertyVersion: nextVersion,
        idempotencyKey: context.idempotencyKey,
        correlationId: context.correlationId,
        reservationReference: input.reservationReference,
        reservationAdvisorId: input.reservationAdvisorId,
        reservationExpiresAt: input.reservationExpiresAt,
        closingAmountMinor: input.closingAmountMinor,
        closingCurrencyCode: input.closingCurrencyCode,
        closingDate: input.closingDate,
      });
      await writeAuditAndOutbox(
        tx,
        context,
        property.id,
        `property.${target.toLowerCase()}`,
        nextVersion,
      );
    },
  );
}
