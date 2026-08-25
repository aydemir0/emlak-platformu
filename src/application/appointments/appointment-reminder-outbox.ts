import { z } from "zod";
import {
  assertWorkerExecutionPolicy,
  emitWorkerRun,
  EMPTY_WORKER_FAILURE_CATEGORIES,
  type WorkerRunReporter,
  type WorkerRunSummary,
} from "@/application/observability/worker-run";
import { AppointmentState } from "@/domain/appointments/appointment-lifecycle";

const schema = z
  .object({
    appointmentId: z.uuid(),
    appointmentVersion: z.coerce.bigint().positive(),
    scheduledFor: z.coerce.date(),
    reminderKind: z.literal("standard"),
  })
  .strict();
export type AppointmentReminderMessage = Readonly<{
  id: string;
  payload: unknown;
  correlationId: string;
  idempotencyKey: string;
  attemptCount: number;
  recoveredStaleLease: boolean;
}>;
export type ReminderNotifier = Readonly<{
  notify(
    input: z.infer<typeof schema> & { idempotencyKey: string },
  ): Promise<void>;
}>;
export type AppointmentReminderWorkerRepository = Readonly<{
  claim(
    workerId: string,
    limit: number,
    leaseMs: number,
  ): Promise<AppointmentReminderMessage[]>;
  currentAppointment(id: string): Promise<{
    version: bigint;
    status: AppointmentState;
    startsAt: Date;
    deletedAt: Date | null;
  } | null>;
  markProcessed(id: string, workerId: string): Promise<void>;
  markFailed(
    id: string,
    workerId: string,
    failure: { code: string; retryable: boolean },
    retryDelayMs: number,
  ): Promise<void>;
}>;
export async function processAppointmentReminderBatch(
  repo: AppointmentReminderWorkerRepository,
  notifier: ReminderNotifier,
  options: Readonly<{
    workerId: string;
    limit: number;
    leaseMs: number;
    retryDelayMs: number;
    maxAttempts: number;
    correlationId: string;
    reportRun?: WorkerRunReporter;
  }>,
): Promise<WorkerRunSummary> {
  assertWorkerExecutionPolicy(options);
  const startedAt = Date.now();
  let messages: AppointmentReminderMessage[] = [];
  let succeeded = 0;
  let retried = 0;
  let deadLettered = 0;
  let dependencyFailures = 0;
  let validationFailures = 0;
  const report = () =>
    emitWorkerRun(options.reportRun, {
      operation: "appointment.reminder",
      correlationId: options.correlationId,
      claimed: messages.length,
      succeeded,
      retried,
      deadLettered,
      staleRecovered: messages.filter((message) => message.recoveredStaleLease)
        .length,
      durationMs: Math.max(0, Date.now() - startedAt),
      failureCategories: {
        ...EMPTY_WORKER_FAILURE_CATEGORIES,
        dependency: dependencyFailures,
        validation: validationFailures,
      },
    });
  try {
    messages = await repo.claim(
      options.workerId,
      options.limit,
      options.leaseMs,
    );
    for (const message of messages) {
      if (message.attemptCount > options.maxAttempts) {
        await repo.markFailed(
          message.id,
          options.workerId,
          {
            code: "APPOINTMENT_REMINDER_MAX_ATTEMPTS_EXCEEDED",
            retryable: false,
          },
          options.retryDelayMs,
        );
        deadLettered += 1;
        dependencyFailures += 1;
        continue;
      }
      const parsed = schema.safeParse(message.payload);
      if (!parsed.success) {
        await repo.markFailed(
          message.id,
          options.workerId,
          { code: "APPOINTMENT_REMINDER_INVALID_PAYLOAD", retryable: false },
          options.retryDelayMs,
        );
        deadLettered += 1;
        validationFailures += 1;
        continue;
      }
      const current = await repo.currentAppointment(parsed.data.appointmentId);
      const stale =
        !current ||
        current.deletedAt ||
        current.version !== parsed.data.appointmentVersion ||
        current.status !== "CONFIRMED" ||
        current.startsAt.valueOf() <= parsed.data.scheduledFor.valueOf();
      if (stale) {
        await repo.markProcessed(message.id, options.workerId);
        succeeded += 1;
        continue;
      }
      let deliveryFailed = false;
      try {
        await notifier.notify({
          ...parsed.data,
          idempotencyKey: message.idempotencyKey,
        });
      } catch {
        deliveryFailed = true;
      }
      if (deliveryFailed) {
        const exhausted = message.attemptCount >= options.maxAttempts;
        await repo.markFailed(
          message.id,
          options.workerId,
          {
            code: exhausted
              ? "APPOINTMENT_REMINDER_MAX_ATTEMPTS_EXCEEDED"
              : "APPOINTMENT_REMINDER_DELIVERY_FAILED",
            retryable: !exhausted,
          },
          options.retryDelayMs,
        );
        if (exhausted) deadLettered += 1;
        else retried += 1;
        dependencyFailures += 1;
        continue;
      }
      await repo.markProcessed(message.id, options.workerId);
      succeeded += 1;
    }
    return report();
  } catch (error) {
    dependencyFailures += 1;
    report();
    throw error;
  }
}
