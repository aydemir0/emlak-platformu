import { createHash, timingSafeEqual } from "node:crypto";

import type { WorkerOperation } from "@/application/observability/worker-run";

const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SchedulerInvocationError extends Error {
  constructor(
    readonly code:
      | "SCHEDULER_SECRET_MISSING"
      | "SCHEDULER_UNAUTHORIZED"
      | "SCHEDULER_RUN_ID_INVALID",
    readonly status: 401 | 503,
  ) {
    super(code);
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authenticateSchedulerRequest(
  expectedSecret: string | undefined,
  authorization: string | undefined,
): void {
  if (!expectedSecret || expectedSecret.length < 32) {
    throw new SchedulerInvocationError("SCHEDULER_SECRET_MISSING", 503);
  }
  const prefix = "Bearer ";
  const supplied = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : "";
  if (!timingSafeEqual(digest(expectedSecret), digest(supplied))) {
    throw new SchedulerInvocationError("SCHEDULER_UNAUTHORIZED", 401);
  }
}

type ScheduledCounts = Readonly<{
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}>;

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new Error("SCHEDULER_RESULT_INVALID");
  }
}

export async function executeScheduledWorker(
  input: Readonly<{
    operation: WorkerOperation;
    runId: string;
    run(): Promise<ScheduledCounts>;
  }>,
) {
  if (!RUN_ID.test(input.runId)) {
    throw new SchedulerInvocationError("SCHEDULER_RUN_ID_INVALID", 401);
  }
  const counts = await input.run();
  Object.values(counts).forEach(assertCount);
  return {
    operation: input.operation,
    runId: input.runId,
    outcome: "completed" as const,
    ...counts,
  };
}
