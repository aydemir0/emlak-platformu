import { createRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request.headers);
  return Response.json(
    { status: "ok", checks: { application: "ready" } },
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
