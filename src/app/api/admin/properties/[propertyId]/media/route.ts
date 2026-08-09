import { z } from "zod";

import { softDeletePropertyMedia } from "@/application/property-media/delete-property-media";
import { reorderPropertyMedia } from "@/application/property-media/reorder-property-media";
import { restorePropertyMedia } from "@/application/property-media/restore-property-media";
import { retryMediaProcessing } from "@/application/property-media/retry-media-processing";
import {
  mediaCommandContext,
  mediaFailure,
} from "@/features/property-media/media-delivery.server";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresMediaReadRepository } from "@/infrastructure/property-media/postgres-media-read-repository.server";
import { PostgresMediaUnitOfWork } from "@/infrastructure/property-media/postgres-media-unit-of-work.server";

const paramsSchema = z.object({ propertyId: z.uuid() });
const identity = {
  mediaId: z.uuid(),
  expectedMediaVersion: z.coerce.bigint().positive(),
};
const bodySchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("reorder"),
      expectedPropertyVersion: z.coerce.bigint().positive(),
      idempotencyKey: z.uuid(),
      items: z
        .array(
          z
            .object({
              mediaId: z.uuid(),
              sortOrder: z.number().int().positive(),
              isCover: z.boolean(),
            })
            .strict(),
        )
        .max(250),
    })
    .strict(),
  z
    .object({
      command: z.literal("delete"),
      ...identity,
      expectedPropertyVersion: z.coerce.bigint().positive(),
      reasonCode: z.string().trim().min(1).max(64),
      idempotencyKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      command: z.literal("restore"),
      ...identity,
      expectedPropertyVersion: z.coerce.bigint().positive(),
      idempotencyKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      command: z.literal("retry"),
      ...identity,
      idempotencyKey: z.uuid(),
    })
    .strict(),
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = paramsSchema.parse(await context.params);
    const actor = await requireStaffPrincipal();
    const items =
      await new PostgresMediaReadRepository().listAdminPropertyMedia(
        actor,
        propertyId,
      );
    return Response.json({
      items: items.map((item) => ({
        ...item,
        version: item.version.toString(),
      })),
    });
  } catch (error) {
    return mediaFailure(error);
  }
}

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ propertyId: string }> },
) {
  try {
    const { propertyId } = paramsSchema.parse(await routeContext.params);
    const body = bodySchema.parse(await request.json());
    const context = await mediaCommandContext(request, body.idempotencyKey);
    const uow = new PostgresMediaUnitOfWork();
    if (body.command === "reorder") {
      const result = await reorderPropertyMedia(uow, context, {
        propertyId,
        expectedPropertyVersion: body.expectedPropertyVersion,
        items: body.items,
      });
      return Response.json({
        propertyVersion: result.propertyVersion.toString(),
      });
    }
    if (body.command === "delete") {
      await softDeletePropertyMedia(uow, context, { propertyId, ...body });
    } else if (body.command === "restore") {
      await restorePropertyMedia(uow, context, { propertyId, ...body });
    } else {
      await retryMediaProcessing(uow, context, { propertyId, ...body });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return mediaFailure(error);
  }
}
