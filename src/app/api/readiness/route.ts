import type { Pool } from "pg";

import { getServerReadinessEnv } from "@/config/env.server.runtime";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";
import { createRequestContext } from "@/lib/request-context";

const DATABASE_TIMEOUT_MS = 1_000;
let inFlightDatabaseProbe: Promise<unknown> | undefined;

export const dynamic = "force-dynamic";

function readinessResponse(
  context: ReturnType<typeof createRequestContext>,
  checks: Readonly<{
    configuration: "ready" | "unavailable";
    database: "ready" | "unavailable";
  }>,
): Response {
  const ready = checks.configuration === "ready" && checks.database === "ready";
  return Response.json(
    { status: ready ? "ready" : "unavailable", checks },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "no-store",
        "x-correlation-id": context.correlationId,
        "x-request-id": context.requestId,
      },
    },
  );
}

function reportFailure(
  error: unknown,
  correlationId: string,
  operation: "readiness.configuration" | "readiness.database",
): void {
  try {
    reportUnexpectedError(error, { correlationId, operation });
  } catch {
    // Probe safety cannot depend on the availability of its logging adapter.
  }
}

async function queryDatabase(pool: Pick<Pool, "query">): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const query = {
    text: "SELECT 1",
    query_timeout: DATABASE_TIMEOUT_MS,
  };
  if (!inFlightDatabaseProbe) {
    const probe = Promise.resolve().then(() => pool.query(query));
    inFlightDatabaseProbe = probe;
    void probe.then(
      () => {
        if (inFlightDatabaseProbe === probe) inFlightDatabaseProbe = undefined;
      },
      () => {
        if (inFlightDatabaseProbe === probe) inFlightDatabaseProbe = undefined;
      },
    );
  }
  try {
    await Promise.race([
      inFlightDatabaseProbe,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("READINESS_DATABASE_TIMEOUT")),
          DATABASE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request.headers);

  try {
    getServerReadinessEnv();
  } catch (error) {
    reportFailure(error, context.correlationId, "readiness.configuration");
    return readinessResponse(context, {
      configuration: "unavailable",
      database: "unavailable",
    });
  }

  try {
    await queryDatabase(getDatabasePool());
  } catch (error) {
    reportFailure(error, context.correlationId, "readiness.database");
    return readinessResponse(context, {
      configuration: "ready",
      database: "unavailable",
    });
  }

  return readinessResponse(context, {
    configuration: "ready",
    database: "ready",
  });
}
