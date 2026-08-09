import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApplicationError,
  toPublicError,
} from "@/application/errors/application-error";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";

export async function mediaCommandContext(
  request: Request,
  idempotencyKey: string,
): Promise<MediaCommandContext> {
  return {
    actor: await requireStaffPrincipal(),
    correlationId: request.headers.get("x-correlation-id") ?? randomUUID(),
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    idempotencyKey,
  };
}

export function mediaFailure(error: unknown) {
  if (error instanceof ApplicationError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "MEDIA_FORBIDDEN" ||
            error.code === "MFA_REQUIRED" ||
            error.code === "FORBIDDEN"
          ? 403
          : error.code === "MEDIA_NOT_FOUND"
            ? 404
            : error.code === "MEDIA_CONFLICT"
              ? 409
              : error.code === "MEDIA_VALIDATION_FAILED"
                ? 422
                : 503;
    return NextResponse.json({ error: toPublicError(error) }, { status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "MEDIA_VALIDATION_FAILED",
          message: "MEDIA_VALIDATION_FAILED",
        },
      },
      { status: 422 },
    );
  }
  return NextResponse.json(
    {
      error: { code: "INTERNAL", message: "Operation could not be completed" },
    },
    { status: 500 },
  );
}
