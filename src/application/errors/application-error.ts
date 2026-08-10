export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "MFA_REQUIRED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "DEPENDENCY_UNAVAILABLE"
  | "PROPERTY_NOT_FOUND"
  | "PROPERTY_FORBIDDEN"
  | "PROPERTY_INVALID_TRANSITION"
  | "PROPERTY_CONFLICT"
  | "PROPERTY_VALIDATION_FAILED"
  | "PROPERTY_REFERENCE_DATA_MISSING"
  | "MEDIA_FORBIDDEN"
  | "MEDIA_NOT_FOUND"
  | "MEDIA_INVALID_TRANSITION"
  | "MEDIA_CONFLICT"
  | "MEDIA_VALIDATION_FAILED"
  | "MEDIA_UPLOAD_EXPIRED"
  | "MEDIA_PROCESSING_FAILED"
  | "MEDIA_STORAGE_UNAVAILABLE"
  | "LEAD_NOT_FOUND"
  | "LEAD_FORBIDDEN"
  | "LEAD_INVALID_TRANSITION"
  | "LEAD_CONFLICT"
  | "LEAD_VALIDATION_FAILED"
  | "INTERNAL";

type ApplicationErrorOptions = ErrorOptions & { correlationId?: string };

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly correlationId?: string;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    options: ApplicationErrorOptions = {},
  ) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
    this.correlationId = options.correlationId;
  }
}

export function toPublicError(error: ApplicationError) {
  return {
    code: error.code,
    message: error.message,
    ...(error.correlationId ? { correlationId: error.correlationId } : {}),
  };
}
