import { ApplicationError } from "@/application/errors/application-error";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import {
  assertAppointmentTransition,
  assertAppointmentVersion,
  type AppointmentState,
} from "@/domain/appointments/appointment-lifecycle";
import {
  defaultAppointmentReminderPolicy,
  type AppointmentReminderPolicy,
} from "@/domain/appointments/appointment-reminder-policy";

export type AppointmentContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
}>;
export type AppointmentRecord = Readonly<{
  id: string;
  leadId: string | null;
  advisorId: string | null;
  status: AppointmentState;
  version: bigint;
  startsAt: Date;
  deletedAt: Date | null;
}>;
export interface AppointmentTransaction {
  getAppointment(id: string, lock: boolean): Promise<AppointmentRecord | null>;
  currentAdvisorId(identityId: string): Promise<string | null>;
  canManageLead(leadId: string, advisorId: string): Promise<boolean>;
  advisorExists(id: string): Promise<boolean>;
  create(values: Record<string, unknown>): Promise<AppointmentRecord>;
  mutate(
    id: string,
    expectedVersion: bigint,
    values: Record<string, unknown>,
  ): Promise<boolean>;
  insertEvent(values: Record<string, unknown>): Promise<void>;
  insertAudit(values: Record<string, unknown>): Promise<void>;
  insertOutbox(values: Record<string, unknown>): Promise<void>;
}
export interface AppointmentUnitOfWork {
  transaction<T>(work: (tx: AppointmentTransaction) => Promise<T>): Promise<T>;
  recordAuthorizationDenial(
    values: Readonly<{
      actorUserIdentityId: string;
      action: string;
      targetId: string;
      correlationId: string;
      requestId: string;
    }>,
  ): Promise<void>;
}
async function authorize(
  tx: AppointmentTransaction,
  c: AppointmentContext,
  a: AppointmentRecord,
) {
  if (!a || a.deletedAt || !a.leadId)
    throw new ApplicationError(
      "APPOINTMENT_NOT_FOUND",
      "APPOINTMENT_NOT_FOUND",
    );
  if (c.actor.role === "ADVISOR") {
    const mine = await tx.currentAdvisorId(c.actor.identityId);
    if (
      !mine ||
      a.advisorId !== mine ||
      !(await tx.canManageLead(a.leadId, mine))
    )
      throw new ApplicationError(
        "APPOINTMENT_FORBIDDEN",
        "APPOINTMENT_FORBIDDEN",
      );
  }
}
function validTime(start: Date, end: Date, tz: string) {
  if (
    !tz.trim() ||
    Number.isNaN(start.valueOf()) ||
    Number.isNaN(end.valueOf()) ||
    start >= end
  )
    throw new ApplicationError(
      "APPOINTMENT_VALIDATION_FAILED",
      "APPOINTMENT_VALIDATION_FAILED",
    );
}
async function eventAudit(
  tx: AppointmentTransaction,
  c: AppointmentContext,
  a: AppointmentRecord,
  eventType: string,
  details: Record<string, unknown>,
) {
  await tx.insertEvent({
    appointmentId: a.id,
    eventType,
    actorUserIdentityId: c.actor.identityId,
    correlationId: c.correlationId,
    sourceIdempotencyKey: c.idempotencyKey,
    eventData: details,
  });
  await tx.insertAudit({
    actorUserIdentityId: c.actor.identityId,
    action: `appointment.${eventType.toLowerCase()}`,
    targetId: a.id,
    correlationId: c.correlationId,
    requestId: c.requestId,
    changeSummary: details,
  });
}
async function scheduleReminders(
  tx: AppointmentTransaction,
  c: AppointmentContext,
  appointment: AppointmentRecord,
  startsAt: Date,
  policy: AppointmentReminderPolicy,
) {
  for (const intent of policy.intents({
    status: appointment.status,
    startsAt,
    now: new Date(),
  })) {
    const scheduledFor = intent.scheduledFor.toISOString();
    await tx.insertOutbox({
      eventName: "appointment.reminder_requested.v1",
      aggregateId: appointment.id,
      correlationId: c.correlationId,
      idempotencyKey: `appointment:${appointment.id}:v${appointment.version}:reminder:${intent.kind}:${scheduledFor}`,
      payload: {
        appointmentId: appointment.id,
        appointmentVersion: appointment.version.toString(),
        scheduledFor,
        reminderKind: intent.kind,
      },
      nextAttemptAt: intent.scheduledFor,
    });
  }
}
async function withDenial<T>(
  u: AppointmentUnitOfWork,
  c: AppointmentContext,
  id: string,
  action: string,
  work: () => Promise<T>,
) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof ApplicationError && e.code === "APPOINTMENT_FORBIDDEN")
      await u.recordAuthorizationDenial({
        actorUserIdentityId: c.actor.identityId,
        action,
        targetId: id,
        correlationId: c.correlationId,
        requestId: c.requestId,
      });
    throw e;
  }
}
export async function createAppointment(
  u: AppointmentUnitOfWork,
  c: AppointmentContext,
  input: Readonly<{
    leadId: string;
    advisorId?: string;
    propertyId?: string;
    startsAt: Date;
    endsAt: Date;
    scheduledTimezone: string;
  }>,
  policy: AppointmentReminderPolicy = defaultAppointmentReminderPolicy,
) {
  validTime(input.startsAt, input.endsAt, input.scheduledTimezone);
  return u.transaction(async (tx) => {
    const mine = await tx.currentAdvisorId(c.actor.identityId);
    const advisorId = c.actor.role === "ADVISOR" ? mine : input.advisorId;
    if (
      !advisorId ||
      !(await tx.advisorExists(advisorId)) ||
      (c.actor.role === "ADVISOR" &&
        !(await tx.canManageLead(input.leadId, advisorId))) ||
      (c.actor.role === "ADMIN" && !input.advisorId)
    )
      throw new ApplicationError(
        "APPOINTMENT_FORBIDDEN",
        "APPOINTMENT_FORBIDDEN",
      );
    let a: AppointmentRecord;
    try {
      a = await tx.create({
        leadId: input.leadId,
        advisorId,
        propertyId: input.propertyId ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        scheduledTimezone: input.scheduledTimezone,
        status: "REQUESTED",
        createdByUserIdentityId: c.actor.identityId,
        updatedByUserIdentityId: c.actor.identityId,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23P01") {
        throw new ApplicationError(
          "APPOINTMENT_TIME_CONFLICT",
          "APPOINTMENT_TIME_CONFLICT",
        );
      }
      throw error;
    }
    await eventAudit(tx, c, a, "CREATED", { status: "REQUESTED", advisorId });
    await scheduleReminders(tx, c, a, input.startsAt, policy);
    return a;
  });
}
export async function mutateAppointment(
  u: AppointmentUnitOfWork,
  c: AppointmentContext,
  input: Readonly<{
    appointmentId: string;
    expectedVersion: bigint;
    eventType:
      | "CONFIRMED"
      | "CANCELLED"
      | "COMPLETED"
      | "NO_SHOW"
      | "RESCHEDULED"
      | "ASSIGNED"
      | "REASSIGNED";
    status?: AppointmentState;
    startsAt?: Date;
    endsAt?: Date;
    scheduledTimezone?: string;
    advisorId?: string;
  }>,
  policy: AppointmentReminderPolicy = defaultAppointmentReminderPolicy,
) {
  return withDenial(
    u,
    c,
    input.appointmentId,
    `appointment.${input.eventType.toLowerCase()}_denied`,
    () =>
      u.transaction(async (tx) => {
        const a = await tx.getAppointment(input.appointmentId, true);
        if (!a)
          throw new ApplicationError(
            "APPOINTMENT_NOT_FOUND",
            "APPOINTMENT_NOT_FOUND",
          );
        await authorize(tx, c, a);
        try {
          assertAppointmentVersion(a.version, input.expectedVersion);
        } catch {
          throw new ApplicationError(
            "APPOINTMENT_CONFLICT",
            "APPOINTMENT_CONFLICT",
          );
        }
        if (input.status)
          try {
            assertAppointmentTransition(a.status, input.status);
          } catch {
            throw new ApplicationError(
              "APPOINTMENT_INVALID_TRANSITION",
              "APPOINTMENT_INVALID_TRANSITION",
            );
          }
        if (input.eventType === "RESCHEDULED")
          validTime(input.startsAt!, input.endsAt!, input.scheduledTimezone!);
        if (
          (input.eventType === "ASSIGNED" ||
            input.eventType === "REASSIGNED") &&
          (c.actor.role !== "ADMIN" ||
            !input.advisorId ||
            !(await tx.advisorExists(input.advisorId)))
        )
          throw new ApplicationError(
            "APPOINTMENT_FORBIDDEN",
            "APPOINTMENT_FORBIDDEN",
          );
        try {
          if (
            !(await tx.mutate(a.id, a.version, {
              status: input.status,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              scheduledTimezone: input.scheduledTimezone,
              advisorId: input.advisorId,
              updatedByUserIdentityId: c.actor.identityId,
            }))
          )
            throw new ApplicationError(
              "APPOINTMENT_CONFLICT",
              "APPOINTMENT_CONFLICT",
            );
        } catch (e) {
          if ((e as { code?: string }).code === "23P01")
            throw new ApplicationError(
              "APPOINTMENT_TIME_CONFLICT",
              "APPOINTMENT_TIME_CONFLICT",
            );
          throw e;
        }
        await eventAudit(tx, c, a, input.eventType, {
          status: input.status,
          advisorId: input.advisorId,
          startsAt: input.startsAt?.toISOString(),
          endsAt: input.endsAt?.toISOString(),
        });
        const nextStatus = input.status ?? a.status;
        await scheduleReminders(
          tx,
          c,
          { ...a, status: nextStatus, version: a.version + 1n },
          input.startsAt ?? a.startsAt,
          policy,
        );
      }),
  );
}
