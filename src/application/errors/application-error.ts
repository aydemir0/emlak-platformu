export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "MFA_REQUIRED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "DEPENDENCY_UNAVAILABLE"
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
