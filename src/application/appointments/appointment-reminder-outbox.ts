import { z } from "zod";
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
  }>,
) {
  const messages = await repo.claim(
    options.workerId,
    options.limit,
    options.leaseMs,
  );
  for (const message of messages) {
    const parsed = schema.safeParse(message.payload);
    if (!parsed.success) {
      await repo.markFailed(
        message.id,
        options.workerId,
        { code: "APPOINTMENT_REMINDER_INVALID_PAYLOAD", retryable: false },
        options.retryDelayMs,
      );
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
      continue;
    }
    try {
      await notifier.notify({
        ...parsed.data,
        idempotencyKey: message.idempotencyKey,
      });
      await repo.markProcessed(message.id, options.workerId);
    } catch (error) {
      await repo.markFailed(
        message.id,
        options.workerId,
        {
          code:
            error instanceof Error
              ? "APPOINTMENT_REMINDER_DELIVERY_FAILED"
              : "APPOINTMENT_REMINDER_DELIVERY_FAILED",
          retryable: true,
        },
        options.retryDelayMs,
      );
    }
  }
  return messages.length;
}
