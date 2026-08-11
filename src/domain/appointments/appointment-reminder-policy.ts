import type { AppointmentState } from "@/domain/appointments/appointment-lifecycle";

export type AppointmentReminderIntent = Readonly<{
  kind: "standard";
  scheduledFor: Date;
}>;
export interface AppointmentReminderPolicy {
  intents(
    input: Readonly<{ status: AppointmentState; startsAt: Date; now: Date }>,
  ): AppointmentReminderIntent[];
}
export function createAppointmentReminderPolicy(
  offsetMinutes = 1440,
): AppointmentReminderPolicy {
  return {
    intents: ({ status, startsAt, now }) => {
      if (status !== "CONFIRMED") return [];
      const scheduledFor = new Date(
        startsAt.valueOf() - offsetMinutes * 60_000,
      );
      return scheduledFor > now ? [{ kind: "standard", scheduledFor }] : [];
    },
  };
}
export const defaultAppointmentReminderPolicy =
  createAppointmentReminderPolicy();
