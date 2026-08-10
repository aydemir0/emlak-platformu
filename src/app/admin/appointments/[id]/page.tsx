import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import {
  PostgresAppointmentReadRepository,
  type AppointmentDetail,
} from "@/infrastructure/appointments/postgres-appointments.server";
import {
  appointmentAssignmentAction,
  appointmentCancelAction,
  appointmentCompleteAction,
  appointmentConfirmAction,
  appointmentNoShowAction,
  appointmentRescheduleAction,
} from "@/features/appointments/appointment-actions.server";

export const dynamic = "force-dynamic";
export default async function AppointmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  const actor = await requireStaffPrincipal();
  const item = await new PostgresAppointmentReadRepository().get(
    actor,
    id.data,
  );
  if (!item) notFound();
  const fields = (
    <>
      <input type="hidden" name="appointmentId" value={item.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={item.version.toString()}
      />
      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
    </>
  );
  const active = item.status === "REQUESTED" || item.status === "CONFIRMED";
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Randevu</h1>
        <p>
          {item.status} · sürüm {item.version.toString()}
        </p>
      </header>
      <dl className="grid gap-3 rounded border p-4 sm:grid-cols-2">
        <div>
          <dt>Başlangıç</dt>
          <dd>{new Date(item.starts_at).toLocaleString("tr-TR")}</dd>
        </div>
        <div>
          <dt>Bitiş</dt>
          <dd>{new Date(item.ends_at).toLocaleString("tr-TR")}</dd>
        </div>
        <div>
          <dt>Lead</dt>
          <dd>
            {item.lead_name ?? item.lead_email ?? "Eski müşteri randevusu"}
          </dd>
        </div>
        <div>
          <dt>Danışman</dt>
          <dd>{item.advisor_name ?? "—"}</dd>
        </div>
        <div>
          <dt>İlan</dt>
          <dd>{item.property_title ?? "—"}</dd>
        </div>
        <div>
          <dt>Saat dilimi</dt>
          <dd>{item.scheduled_timezone ?? "—"}</dd>
        </div>
      </dl>
      {item.lead_id && active ? (
        <div className="flex flex-wrap gap-2">
          <form action={appointmentConfirmAction}>
            {fields}
            <button
              className="rounded border px-3 py-1"
              disabled={item.status !== "REQUESTED"}
            >
              Onayla
            </button>
          </form>
          <form action={appointmentCancelAction}>
            {fields}
            <button className="rounded border px-3 py-1">İptal et</button>
          </form>
          {item.status === "CONFIRMED" ? (
            <>
              <form action={appointmentCompleteAction}>
                {fields}
                <button className="rounded border px-3 py-1">Tamamlandı</button>
              </form>
              <form action={appointmentNoShowAction}>
                {fields}
                <button className="rounded border px-3 py-1">Gelmedi</button>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
      {item.lead_id && active ? (
        <form
          action={appointmentRescheduleAction}
          className="space-y-2 rounded border p-4"
        >
          <h2 className="font-medium">Yeniden planla</h2>
          {fields}
          <input name="startsAt" type="datetime-local" required />
          <input name="endsAt" type="datetime-local" required />
          <input
            name="scheduledTimezone"
            defaultValue={item.scheduled_timezone ?? "Europe/Istanbul"}
            required
          />
          <button className="rounded border px-3 py-1">Kaydet</button>
        </form>
      ) : null}
      {actor.role === "ADMIN" && item.lead_id ? (
        <form
          action={appointmentAssignmentAction}
          className="space-y-2 rounded border p-4"
        >
          <h2 className="font-medium">Danışman ata</h2>
          {fields}
          <input
            name="advisorId"
            defaultValue={item.advisor_id ?? ""}
            required
            aria-label="Danışman UUID"
          />
          <button className="rounded border px-3 py-1">Ata</button>
        </form>
      ) : null}
      <section>
        <h2 className="font-semibold">Hareketler</h2>
        <ol className="mt-3 space-y-2">
          {(item as AppointmentDetail).events.map((event) => (
            <li
              key={`${event.occurred_at}-${event.event_type}`}
              className="rounded border p-3"
            >
              <b>{event.event_type}</b>
              <time className="text-muted-foreground ml-2 text-xs">
                {new Date(event.occurred_at).toLocaleString("tr-TR")}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
