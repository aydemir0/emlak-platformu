import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";
import type { MediaOrderingItem } from "@/domain/property-media/media";
import { assertCompleteOrdering } from "@/domain/property-media/media-policy";

export async function reorderPropertyMedia(
  uow: MediaUnitOfWork,
  context: MediaCommandContext,
  input: Readonly<{
    propertyId: string;
    expectedPropertyVersion: bigint;
    items: readonly MediaOrderingItem[];
  }>,
): Promise<{ propertyVersion: bigint }> {
  try {
    return await uow.transaction(async (tx) => {
      await authorizeMediaCommand(
        tx,
        context,
        input.propertyId,
        "manage",
        true,
      );
      const propertyVersion = await tx.getPropertyVersion(input.propertyId, {
        lock: true,
      });
      if (propertyVersion !== input.expectedPropertyVersion) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      const active = await tx.listActiveMedia(input.propertyId, { lock: true });
      try {
        assertCompleteOrdering(
          active.map((media) => media.id),
          input.items,
        );
      } catch (error) {
        throw new ApplicationError(
          error instanceof Error && error.message === "MEDIA_CONFLICT"
            ? "MEDIA_CONFLICT"
            : "MEDIA_VALIDATION_FAILED",
          error instanceof Error ? error.message : "MEDIA_VALIDATION_FAILED",
        );
      }
      await tx.applyOrdering(input.propertyId, input.items);
      if (!(await tx.bumpPropertyVersion(input.propertyId, propertyVersion))) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.insertAuditLog({
        actorUserIdentityId: context.actor.identityId,
        action: "property_media.reordered",
        targetTable: "properties",
        targetId: input.propertyId,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: { mediaCount: input.items.length },
      });
      await tx.insertOutboxMessage({
        eventType: "property_media.order_changed",
        domainName: "property-media",
        aggregateType: "property",
        eventVersion: 1,
        aggregateId: input.propertyId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        payload: { propertyVersion: (propertyVersion + 1n).toString() },
      });
      return { propertyVersion: propertyVersion + 1n };
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.reorder",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
}
