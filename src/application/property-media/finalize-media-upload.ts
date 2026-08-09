import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import { checksumSha256 } from "@/application/property-media/initialize-media-upload";
import type {
  FinalizeMediaUploadInput,
  MediaCommandContext,
  MediaRecord,
} from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";
import type { MediaStorage } from "@/application/property-media/media-storage";

export async function finalizeMediaUpload(
  uow: MediaUnitOfWork,
  storage: MediaStorage,
  context: MediaCommandContext,
  input: FinalizeMediaUploadInput,
  now: () => Date = () => new Date(),
): Promise<MediaRecord> {
  let preflight;
  try {
    preflight = await uow.transaction(async (tx) => {
      await authorizeMediaCommand(
        tx,
        context,
        input.propertyId,
        "manage",
        true,
      );
      const session = await tx.getUploadSession(input.sessionId, {
        lock: false,
      });
      if (
        !session ||
        session.propertyId !== input.propertyId ||
        session.initiatedByIdentityId !== context.actor.identityId
      ) {
        throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
      }
      if (session.status === "FINALIZED") {
        const media = await tx.getMediaByUploadSession(session.id);
        if (!media)
          throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
        return { session, media };
      }
      return { session, media: null };
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.upload_finalize",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
  if (preflight.media) return preflight.media;
  if (preflight.session.expiresAt <= now()) {
    throw new ApplicationError("MEDIA_UPLOAD_EXPIRED", "MEDIA_UPLOAD_EXPIRED");
  }

  let stored;
  try {
    stored = await storage.get(
      preflight.session.objectKey,
      preflight.session.maximumBytes,
    );
  } catch (error) {
    throw new ApplicationError(
      "MEDIA_STORAGE_UNAVAILABLE",
      "MEDIA_STORAGE_UNAVAILABLE",
      { cause: error },
    );
  }
  if (!stored) throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
  const observedChecksum = checksumSha256(stored.bytes);
  if (
    stored.metadata.key !== preflight.session.objectKey ||
    stored.metadata.contentType !== preflight.session.expectedMimeType ||
    stored.metadata.size !== preflight.session.maximumBytes ||
    (preflight.session.expectedChecksumSha256 !== null &&
      preflight.session.expectedChecksumSha256 !== observedChecksum)
  ) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }

  return uow.transaction(async (tx) => {
    await authorizeMediaCommand(tx, context, input.propertyId, "manage");
    const session = await tx.getUploadSession(input.sessionId, { lock: true });
    if (
      !session ||
      session.propertyId !== input.propertyId ||
      session.initiatedByIdentityId !== context.actor.identityId
    ) {
      throw new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND");
    }
    const replay = await tx.getMediaByUploadSession(session.id);
    if (session.status === "FINALIZED" && replay) return replay;
    if (session.status !== "REQUESTED" || session.expiresAt <= now()) {
      throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
    }
    return tx.finalizeUpload({
      session,
      actorIdentityId: context.actor.identityId,
      observedByteSize: stored.metadata.size,
      observedChecksumSha256: observedChecksum,
      observedEtag: stored.metadata.etag,
      observedAt: stored.metadata.uploadedAt,
      correlationId: context.correlationId,
      requestId: context.requestId,
    });
  });
}
