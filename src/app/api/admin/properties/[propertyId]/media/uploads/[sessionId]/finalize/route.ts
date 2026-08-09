import { z } from "zod";

import { finalizeMediaUpload } from "@/application/property-media/finalize-media-upload";
import {
  mediaCommandContext,
  mediaFailure,
} from "@/features/property-media/media-delivery.server";
import { getMediaStorage } from "@/infrastructure/property-media/media-storage-factory.server";
import { PostgresMediaUnitOfWork } from "@/infrastructure/property-media/postgres-media-unit-of-work.server";

const bodySchema = z.object({ idempotencyKey: z.uuid() }).strict();
const paramsSchema = z.object({ propertyId: z.uuid(), sessionId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ propertyId: string; sessionId: string }> },
) {
  try {
    const params = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const commandContext = await mediaCommandContext(
      request,
      body.idempotencyKey,
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
    return mediaFailure(error);
  }
}
