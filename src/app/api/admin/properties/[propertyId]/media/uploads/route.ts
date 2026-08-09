import { z } from "zod";

import { initializeMediaUpload } from "@/application/property-media/initialize-media-upload";
import {
  mediaCommandContext,
  mediaFailure,
} from "@/features/property-media/media-delivery.server";
import { getMediaStorage } from "@/infrastructure/property-media/media-storage-factory.server";
import { PostgresMediaUnitOfWork } from "@/infrastructure/property-media/postgres-media-unit-of-work.server";

const bodySchema = z
  .object({
    declaredMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive(),
    checksumSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    idempotencyKey: z.uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = z
      .object({ propertyId: z.uuid() })
      .parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const commandContext = await mediaCommandContext(
      request,
      body.idempotencyKey,
    );
    const result = await initializeMediaUpload(
      new PostgresMediaUnitOfWork(),
      getMediaStorage(),
      commandContext,
      {
        propertyId,
        declaredMimeType: body.declaredMimeType,
        byteSize: body.byteSize,
        checksumSha256: body.checksumSha256,
      },
    );
    return Response.json({
      sessionId: result.session.id,
      mediaId: result.session.plannedMediaId,
      upload: result.grant,
    });
  } catch (error) {
    return mediaFailure(error);
  }
}
