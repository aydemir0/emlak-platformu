import { z } from "zod";

import { finalizeMediaUpload } from "@/application/property-media/finalize-media-upload";
import {
  MEDIA_UPLOAD_METADATA_MAX_BYTES,
  mediaCommandContext,
  mediaFailure,
  readBoundedMediaJson,
} from "@/features/property-media/media-delivery.server";
import { getMediaStorage } from "@/infrastructure/property-media/media-storage-factory.server";
import { PostgresMediaUnitOfWork } from "@/infrastructure/property-media/postgres-media-unit-of-work.server";
import { createRequestContext } from "@/lib/request-context";

const bodySchema = z.object({ idempotencyKey: z.uuid() }).strict();
const paramsSchema = z.object({ propertyId: z.uuid(), sessionId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ propertyId: string; sessionId: string }> },
) {
  const requestContext = createRequestContext(request.headers);
  try {
    const params = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(
      await readBoundedMediaJson(request, MEDIA_UPLOAD_METADATA_MAX_BYTES),
    );
    const commandContext = await mediaCommandContext(
      request,
      body.idempotencyKey,
      requestContext,
    );
    const media = await finalizeMediaUpload(
      new PostgresMediaUnitOfWork(),
      getMediaStorage(),
      commandContext,
      params,
    );
    return Response.json({
      mediaId: media.id,
      state: media.state,
      version: media.version.toString(),
    });
  } catch (error) {
    return mediaFailure(error, {
      correlationId: requestContext.correlationId,
      operation: "media.upload.finalize",
    });
  }
}
