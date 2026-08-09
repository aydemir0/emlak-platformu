import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";

export async function restorePropertyMedia(
  uow: MediaUnitOfWork,
  context: MediaCommandContext,
  input: Readonly<{
    propertyId: string;
    mediaId: string;
    expectedMediaVersion: bigint;
    expectedPropertyVersion: bigint;
    now?: Date;
  }>,
): Promise<void> {
  try {
    await uow.transaction(async (tx) => {
      await authorizeMediaCommand(
        tx,
        context,
        input.propertyId,
        "restore",
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
        !media.deletedAt
      ) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.restoreMedia({
        mediaId: media.id,
        now: input.now ?? new Date(),
      });
      if (
        !propertyVersion ||
        !(await tx.bumpPropertyVersion(input.propertyId, propertyVersion))
      ) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.insertAuditLog({
        actorUserIdentityId: context.actor.identityId,
        action: "property_media.restored",
        targetTable: "property_media",
        targetId: media.id,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: {
          state: "UPLOADED",
          visibility: "PRIVATE",
          cover: false,
        },
      });
      await tx.insertOutboxMessage({
        eventType: "property_media.processing_requested",
        domainName: "property-media",
        aggregateType: "property_media",
        eventVersion: 1,
        aggregateId: media.id,
        correlationId: context.correlationId,
        idempotencyKey: `${context.idempotencyKey}:restore-processing`,
        payload: { sourceVersion: media.sourceVersion },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.restore",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
}
