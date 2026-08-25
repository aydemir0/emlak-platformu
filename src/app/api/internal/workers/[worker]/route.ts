import { randomUUID } from "node:crypto";

import {
  authenticateSchedulerRequest,
  SchedulerInvocationError,
} from "@/application/workers/scheduler-invocation";
import { getServerReadinessEnv } from "@/config/env.server.runtime";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import {
  ConfiguredWorkerUnavailableError,
  isScheduledWorkerName,
  runConfiguredWorker,
} from "@/infrastructure/workers/configured-worker.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable(status: 401 | 404 | 503, runId?: string): Response {
  return Response.json(
    { status: "unavailable" },
    {
      status,
      headers: {
        ...NO_STORE,
        ...(runId ? { "X-Run-Id": runId } : {}),
      },
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ worker: string }> },
): Promise<Response> {
  const { worker } = await context.params;
  if (!isScheduledWorkerName(worker)) return unavailable(404);
  const runId = request.headers.get("x-run-id") ?? randomUUID();

  try {
    const env = getServerReadinessEnv();
    authenticateSchedulerRequest(
      env.CRON_SECRET,
      request.headers.get("authorization") ?? undefined,
    );
    const result = await runConfiguredWorker(worker, runId);
    return Response.json(result, {
      headers: { ...NO_STORE, "X-Run-Id": runId },
    });
  } catch (error) {
    if (error instanceof SchedulerInvocationError) {
      return unavailable(error.status, runId);
    }
    if (error instanceof ConfiguredWorkerUnavailableError) {
      return unavailable(503, runId);
    }
    reportUnexpectedError(error, {
      correlationId: runId,
      operation: `worker.${worker}`,
    });
    return unavailable(503, runId);
  }
}
