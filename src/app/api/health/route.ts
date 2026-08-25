import { getRuntimeIdentity } from "@/config/env.server.runtime";
import { createRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request.headers);
  let identity: ReturnType<typeof getRuntimeIdentity> | undefined;
  try {
    identity = getRuntimeIdentity();
  } catch {
    // Liveness reflects the process only; readiness reports invalid config.
  }
  return Response.json(
    {
      status: "ok",
      ...(identity
        ? {
            environment: identity.APP_ENV,
            release: identity.APP_RELEASE,
          }
        : {}),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-correlation-id": context.correlationId,
        "x-request-id": context.requestId,
      },
    },
  );
}
