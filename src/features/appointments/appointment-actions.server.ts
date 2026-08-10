"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApplicationError } from "@/application/errors/application-error";
import {
  createAppointment,
  mutateAppointment,
} from "@/application/appointments/appointment-use-cases";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresAppointmentUnitOfWork } from "@/infrastructure/appointments/postgres-appointments.server";

const uow = new PostgresAppointmentUnitOfWork();
const base = z.object({
  appointmentId: z.uuid(),
  expectedVersion: z.coerce.bigint().positive(),
  idempotencyKey: z.uuid(),
});

async function context(form: FormData) {
  const requestHeaders = await headers();
  return {
    actor: await requireStaffPrincipal(),
    correlationId: randomUUID(),
    requestId: requestHeaders.get("x-request-id") ?? randomUUID(),
    idempotencyKey: z.uuid().parse(form.get("idempotencyKey")),
  };
}

function revalidate(id: string) {
  revalidatePath("/admin/appointments");
  revalidatePath(`/admin/appointments/${id}`);
}

export function appointmentUiError(error: unknown): string {
  if (!(error instanceof ApplicationError))
    return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  switch (error.code) {
    case "APPOINTMENT_TIME_CONFLICT":
      return "Bu danışmanın seçilen saatte başka bir randevusu var.";
    case "APPOINTMENT_CONFLICT":
      return "Randevu değişti. Sayfayı yenileyip tekrar deneyin.";
    case "APPOINTMENT_INVALID_TRANSITION":
      return "Bu işlem randevunun mevcut durumunda yapılamaz.";
    case "APPOINTMENT_VALIDATION_FAILED":
      return "Randevu bilgileri geçerli değil.";
    case "APPOINTMENT_NOT_FOUND":
    case "APPOINTMENT_FORBIDDEN":
      return "Randevu bulunamadı veya bu işlem için yetkiniz yok.";
    default:
      return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
}

async function command(
  form: FormData,
  input: Parameters<typeof mutateAppointment>[2],
) {
  await mutateAppointment(uow, await context(form), input);
  revalidate(input.appointmentId);
}

export async function appointmentConfirmAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, { ...f, eventType: "CONFIRMED", status: "CONFIRMED" });
}
export async function appointmentCancelAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, { ...f, eventType: "CANCELLED", status: "CANCELLED" });
}
export async function appointmentCompleteAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, { ...f, eventType: "COMPLETED", status: "COMPLETED" });
}
export async function appointmentNoShowAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, { ...f, eventType: "NO_SHOW", status: "NO_SHOW" });
}
export async function appointmentRescheduleAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, {
    ...f,
    eventType: "RESCHEDULED",
    startsAt: z.coerce.date().parse(form.get("startsAt")),
    endsAt: z.coerce.date().parse(form.get("endsAt")),
    scheduledTimezone: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .parse(form.get("scheduledTimezone")),
  });
}
export async function appointmentAssignmentAction(form: FormData) {
  const f = base.parse(Object.fromEntries(form));
  await command(form, {
    ...f,
    eventType: "REASSIGNED",
    advisorId: z.uuid().parse(form.get("advisorId")),
  });
}
export async function appointmentCreateAction(form: FormData) {
  const c = await context(form);
  const input = z
    .object({
      leadId: z.uuid(),
      advisorId: z.uuid().optional(),
      propertyId: z.uuid().optional(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      scheduledTimezone: z.string().trim().min(1).max(128),
    })
    .parse(Object.fromEntries(form));
  const appointment = await createAppointment(uow, c, input);
  revalidate(appointment.id);
  return appointment.id;
}
