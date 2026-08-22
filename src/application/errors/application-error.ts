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
  | "LEAD_CONVERSION_NOT_ALLOWED"
  | "LEAD_CONVERSION_INTEGRITY_CONFLICT"
  | "CUSTOMER_IDENTITY_CONFLICT"
  | "CUSTOMER_LINK_NOT_AUTHORIZED"
  | "LEAD_CONVERSION_FAILED"
  | "APPOINTMENT_NOT_FOUND"
  | "APPOINTMENT_FORBIDDEN"
  | "APPOINTMENT_CONFLICT"
  | "APPOINTMENT_INVALID_TRANSITION"
  | "APPOINTMENT_TIME_CONFLICT"
  | "APPOINTMENT_VALIDATION_FAILED"
  | "MATCHING_REQUEST_NOT_FOUND"
  | "MATCHING_FORBIDDEN"
  | "MATCHING_INPUT_INVALID"
  | "MATCHING_CANDIDATE_LIMIT_EXCEEDED"
  | "MATCHING_CONCURRENCY_CONFLICT"
  | "MATCHING_PERSISTENCE_FAILED"
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
