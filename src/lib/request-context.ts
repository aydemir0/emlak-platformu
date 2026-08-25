import { z } from "zod";

const correlationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/);

export type RequestContext = Readonly<{
  correlationId: string;
  requestId: string;
}>;

export function isSafeCorrelationId(value: unknown): value is string {
  return correlationIdSchema.safeParse(value).success;
}

function trustedOrGenerated(value: string | null): string {
  return isSafeCorrelationId(value) ? value : crypto.randomUUID();
}

export function createRequestContext(headers: Headers): RequestContext {
  return {
    correlationId: trustedOrGenerated(headers.get("x-correlation-id")),
    requestId: trustedOrGenerated(headers.get("x-request-id")),
  };
}
