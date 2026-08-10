export const APPOINTMENT_STATES = [
  "REQUESTED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export const APPOINTMENT_STATE_TRANSITIONS: Readonly<
  Record<AppointmentState, readonly AppointmentState[]>
> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function assertAppointmentTransition(
  from: AppointmentState | string,
  to: AppointmentState | string,
): asserts to is AppointmentState {
  if (
    !APPOINTMENT_STATE_TRANSITIONS[from as AppointmentState]?.includes(
      to as AppointmentState,
    )
  ) {
    throw new Error("APPOINTMENT_INVALID_TRANSITION");
  }
}

export function isAppointmentTimeBlockingState(
  state: AppointmentState | string,
): state is Extract<AppointmentState, "REQUESTED" | "CONFIRMED"> {
  return state === "REQUESTED" || state === "CONFIRMED";
}

export function assertAppointmentVersion(
  currentVersion: bigint,
  expectedVersion: bigint,
): void {
  if (expectedVersion < 1n) {
    throw new Error("APPOINTMENT_INVALID_VERSION");
  }

  if (currentVersion !== expectedVersion) {
    throw new Error("APPOINTMENT_VERSION_CONFLICT");
  }
}
