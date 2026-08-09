import { z } from "zod";

const correlationIdSchema = z.uuid();

export type RequestContext = Readonly<{
  correlationId: string;
  requestId: string;
}>;

export function createRequestContext(headers: Headers): RequestContext {
  const incoming = correlationIdSchema.safeParse(
    headers.get("x-correlation-id"),
  );
  const request = correlationIdSchema.safeParse(headers.get("x-request-id"));
  return {
    correlationId: incoming.success ? incoming.data : crypto.randomUUID(),
    requestId: request.success ? request.data : crypto.randomUUID(),
  };
}
