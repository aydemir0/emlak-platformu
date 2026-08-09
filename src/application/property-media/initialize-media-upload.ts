import { createHash, randomUUID } from "node:crypto";

import { ApplicationError } from "@/application/errors/application-error";
import { authorizeMediaCommand } from "@/application/property-media/authorize-media-command";
import type {
  InitializeMediaUploadInput,
  MediaCommandContext,
  UploadSessionRecord,
} from "@/application/property-media/media-contracts";
import type { MediaUnitOfWork } from "@/application/property-media/media-ports";
import type {
  MediaStorage,
  UploadGrant,
} from "@/application/property-media/media-storage";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import { buildQuarantineKey } from "@/domain/property-media/object-key";

function validChecksum(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{64}$/.test(value);
}

function sameRequest(
  session: UploadSessionRecord,
  input: InitializeMediaUploadInput,
  actorIdentityId: string,
): boolean {
  return (
    session.propertyId === input.propertyId &&
    session.initiatedByIdentityId === actorIdentityId &&
    session.expectedMimeType === input.declaredMimeType &&
    session.maximumBytes === input.byteSize &&
    session.expectedChecksumSha256 === (input.checksumSha256 ?? null)
  );
}

export async function initializeMediaUpload(
  uow: MediaUnitOfWork,
  storage: MediaStorage,
  context: MediaCommandContext,
  input: InitializeMediaUploadInput,
  dependencies: Readonly<{
    now?: () => Date;
    uuid?: () => string;
  }> = {},
): Promise<{ session: UploadSessionRecord; grant: UploadGrant }> {
  if (
    !PROPERTY_V1_RECIPE.acceptedMimeTypes.includes(
      input.declaredMimeType as (typeof PROPERTY_V1_RECIPE.acceptedMimeTypes)[number],
    ) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > PROPERTY_V1_RECIPE.maximumBytes ||
    (input.checksumSha256 !== undefined && !validChecksum(input.checksumSha256))
  ) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }
  const now = dependencies.now?.() ?? new Date();
  const uuid = dependencies.uuid ?? randomUUID;
  let session: UploadSessionRecord;
  try {
    session = await uow.transaction(async (tx) => {
      await authorizeMediaCommand(tx, context, input.propertyId, "manage");
      const replay = await tx.findUploadSessionByIdempotencyKey(
        context.idempotencyKey,
        { lock: true },
      );
      if (replay) {
        if (!sameRequest(replay, input, context.actor.identityId)) {
          throw new ApplicationError("MEDIA_CONFLICT", "MEDIA_CONFLICT");
        }
        return replay;
      }
      const mediaId = uuid();
      const created: UploadSessionRecord = {
        id: uuid(),
        propertyId: input.propertyId,
        plannedMediaId: mediaId,
        initiatedByIdentityId: context.actor.identityId,
        objectKey: buildQuarantineKey(input.propertyId, mediaId, 1),
        idempotencyKey: context.idempotencyKey,
        expectedMimeType: input.declaredMimeType,
        expectedChecksumSha256: input.checksumSha256 ?? null,
        maximumBytes: input.byteSize,
        status: "REQUESTED",
        expiresAt: new Date(
          now.getTime() + PROPERTY_V1_RECIPE.uploadGrantTtlSeconds * 1000,
        ),
        version: 1n,
      };
      await tx.insertUploadSession(created);
      await tx.insertAuditLog({
        actorUserIdentityId: context.actor.identityId,
        action: "property_media.upload_initialized",
        targetTable: "media_upload_sessions",
        targetId: created.id,
        correlationId: context.correlationId,
        requestId: context.requestId,
        changeSummary: { propertyId: input.propertyId },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "MEDIA_FORBIDDEN") {
      await uow.recordDeniedCommand(
        context,
        input.propertyId,
        "property_media.upload_initialize",
        "MEDIA_FORBIDDEN",
      );
    }
    throw error;
  }
  if (session.expiresAt <= now || session.status === "EXPIRED") {
    throw new ApplicationError("MEDIA_UPLOAD_EXPIRED", "MEDIA_UPLOAD_EXPIRED");
  }
  try {
    const grant = await storage.presignPut({
      key: session.objectKey,
      contentType: session.expectedMimeType,
      expiresInSeconds: Math.min(
        PROPERTY_V1_RECIPE.uploadGrantTtlSeconds,
        Math.max(
          1,
          Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
        ),
      ),
      maximumBytes: session.maximumBytes,
    });
    return { session, grant };
  } catch (error) {
    throw new ApplicationError(
      "MEDIA_STORAGE_UNAVAILABLE",
      "MEDIA_STORAGE_UNAVAILABLE",
      {
        cause: error,
      },
    );
  }
}

export function checksumSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
