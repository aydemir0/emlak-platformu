import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";

export async function retryMediaProcessing(
  uow: MediaUnitOfWork,
  context: MediaCommandContext,
  input: Readonly<{
    propertyId: string;
    mediaId: string;
    expectedMediaVersion: bigint;
    now?: Date;
  }>,
): Promise<void> {
  try {
    await uow.transaction(async (tx) => {
      await authorizeMediaCommand(
        tx,
        context,
        input.propertyId,
        "manage",
        true,
      );
      const media = await tx.getMedia(input.mediaId, { lock: true });
      if (!media || media.propertyId !== input.propertyId) {
        throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
      }
      if (
        media.version !== input.expectedMediaVersion ||
        media.state !== "FAILED" ||
        media.failureRetryable !== true ||
        !(await tx.retryMedia({
          mediaId: media.id,
          expectedVersion: media.version,
          now: input.now ?? new Date(),
        }))
      ) {
        throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
      }
      await tx.insertAuditLog({
        actorUserIdentityId: context.actor.identityId,
        action: "property_media.processing_retried",
        targetTable: "property_media",
        targetId: media.id,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: { state: "UPLOADED" },
      });
      await tx.insertOutboxMessage({
        eventType: "property_media.processing_requested",
        domainName: "property-media",
        aggregateType: "property_media",
        eventVersion: 1,
        aggregateId: media.id,
        correlationId: context.correlationId,
        idempotencyKey: `${context.idempotencyKey}:retry`,
        payload: { sourceVersion: media.sourceVersion },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.processing_retry",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
}
