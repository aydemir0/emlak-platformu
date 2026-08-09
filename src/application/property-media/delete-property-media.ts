import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";

export async function softDeletePropertyMedia(
  uow: MediaUnitOfWork,
  context: MediaCommandContext,
  input: Readonly<{
    propertyId: string;
    mediaId: string;
    expectedMediaVersion: bigint;
    expectedPropertyVersion: bigint;
    reasonCode: string;
    now?: Date;
  }>,
): Promise<void> {
  try {
    await uow.transaction(async (tx) => {
      await authorizeMediaCommand(
        tx,
        context,
        input.propertyId,
        "delete",
        true,
      );
      const propertyVersion = await tx.getPropertyVersion(input.propertyId, {
        lock: true,
      });
      const media = await tx.getMedia(input.mediaId, { lock: true });
      if (!media || media.propertyId !== input.propertyId) {
        throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
      }
      if (
        propertyVersion !== input.expectedPropertyVersion ||
        media.version !== input.expectedMediaVersion ||
        media.deletedAt
      ) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.softDeleteMedia({
        mediaId: media.id,
        actorIdentityId: context.actor.identityId,
        reasonCode: input.reasonCode,
        now: input.now ?? new Date(),
      });
      const remaining = (
        await tx.listActiveMedia(input.propertyId, { lock: true })
      ).filter((item) => item.id !== media.id);
      if (remaining.length) {
        const coverId = remaining.some((item) => item.isCover)
          ? remaining.find((item) => item.isCover)!.id
          : remaining[0]!.id;
        await tx.applyOrdering(
          input.propertyId,
          remaining.map((item, index) => ({
            mediaId: item.id,
            sortOrder: index + 1,
            isCover: item.id === coverId,
          })),
        );
      }
      if (
        !propertyVersion ||
        !(await tx.bumpPropertyVersion(input.propertyId, propertyVersion))
      ) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.insertAuditLog({
        actorUserIdentityId: context.actor.identityId,
        action: "property_media.deleted",
        targetTable: "property_media",
        targetId: media.id,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: { state: "DELETED" },
        reasonCode: input.reasonCode,
      });
      await tx.insertOutboxMessage({
        eventType: "property_media.delivery_revoke_requested",
        domainName: "property-media",
        aggregateType: "property_media",
        eventVersion: 1,
        aggregateId: media.id,
        correlationId: context.correlationId,
        idempotencyKey: `${context.idempotencyKey}:revoke`,
        payload: { sourceVersion: media.sourceVersion },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.delete",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
}
