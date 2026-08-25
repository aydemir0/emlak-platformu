import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ApplicationError,
  isReportableOperationalFailure,
  toPublicError,
} from "@/application/errors/application-error";
import type { MediaCommandContext } from "@/application/property-media/media-contracts";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import {
  createRequestContext,
  type RequestContext,
} from "@/lib/request-context";

export const MEDIA_UPLOAD_METADATA_MAX_BYTES = 16 * 1024;
export const MEDIA_COMMAND_MAX_BYTES = 128 * 1024;

export async function readBoundedMediaJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    throw new ApplicationError(
      "MEDIA_REQUEST_TOO_LARGE",
      "MEDIA_REQUEST_TOO_LARGE",
    );
  }
  if (request.body === null) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new ApplicationError(
        "MEDIA_REQUEST_TOO_LARGE",
        "MEDIA_REQUEST_TOO_LARGE",
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new ApplicationError(
      "MEDIA_VALIDATION_FAILED",
      "MEDIA_VALIDATION_FAILED",
      { cause: error },
    );
  }
}

export async function mediaCommandContext(
  request: Request,
  idempotencyKey: string,
  requestContext: RequestContext = createRequestContext(request.headers),
): Promise<MediaCommandContext> {
  return {
    actor: await requireStaffPrincipal(),
    ...requestContext,
    idempotencyKey,
  };
}

export function mediaFailure(
  error: unknown,
  context?: Readonly<{ correlationId?: string; operation: string }>,
) {
  if (
    !(error instanceof z.ZodError) &&
    context &&
    isReportableOperationalFailure(error)
  ) {
    reportUnexpectedError(error, context);
  }
  if (error instanceof ApplicationError) {
    const outwardError = isReportableOperationalFailure(error)
      ? new ApplicationError(error.code, error.code, {
          correlationId: context?.correlationId,
        })
      : error.code === "MEDIA_FORBIDDEN" || error.code === "MEDIA_NOT_FOUND"
        ? new ApplicationError("MEDIA_NOT_FOUND", "MEDIA_NOT_FOUND", {
            correlationId: error.correlationId,
          })
        : error;
    const status =
      outwardError.code === "UNAUTHENTICATED"
        ? 401
        : outwardError.code === "MEDIA_REQUEST_TOO_LARGE"
          ? 413
          : outwardError.code === "MFA_REQUIRED" ||
              outwardError.code === "FORBIDDEN"
            ? 403
            : outwardError.code === "MEDIA_NOT_FOUND"
              ? 404
              : outwardError.code === "MEDIA_CONFLICT"
                ? 409
                : outwardError.code === "MEDIA_VALIDATION_FAILED"
                  ? 422
                  : 503;
    return NextResponse.json(
      { error: toPublicError(outwardError) },
      { status },
    );
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
