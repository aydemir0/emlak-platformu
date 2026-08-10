import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresLeadCrmReadRepository } from "@/infrastructure/leads/postgres-lead-crm.server";
import {
  leadAssignmentAction,
  leadNoteAction,
  leadStatusAction,
} from "@/features/leads/lead-actions.server";
export const dynamic = "force-dynamic";
const states = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "WON",
  "LOST",
];
type Advisor = { id: string; display_name: string };
type TimelineEntry = {
  source: "lead" | "appointment";
  eventType: string;
  summary: string | null;
  occurredAt: Date;
  appointmentId: string | null;
};
export default async function LeadDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaffPrincipal();
  const repo = new PostgresLeadCrmReadRepository();
  const [lead, advisors] = await Promise.all([
    repo.get(actor, id),
    actor.role === "ADMIN" ? repo.advisors() : Promise.resolve([]),
  ]);
  if (!lead) notFound();
  const hidden = (
    <>
      <input type="hidden" name="leadId" value={lead.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={lead.version.toString()}
      />
      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
    </>
  );
  return (
    <section className="space-y-6">
      <header>
        <p className="text-muted-foreground text-sm">
          {lead.property_title ?? "Erişilemeyen ilan"}
        </p>
        <h1 className="text-2xl font-semibold">
          {lead.name ?? lead.email ?? lead.phone ?? "Lead"}
        </h1>
        <p>
          {lead.status} · {lead.advisor_name ?? "Atanmamış"}
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={leadStatusAction}
          className="space-y-2 rounded border p-4"
        >
          {hidden}
          <h2 className="font-medium">Durum</h2>
          <select name="status" defaultValue={lead.status}>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="ml-2 rounded border px-3 py-1">Güncelle</button>
        </form>
        <form action={leadNoteAction} className="space-y-2 rounded border p-4">
          {hidden}
          <h2 className="font-medium">Not ekle</h2>
          <textarea
            name="summary"
            required
            maxLength={4000}
            className="block w-full rounded border p-2"
          />
          <button className="rounded border px-3 py-1">Kaydet</button>
        </form>
        {actor.role === "ADMIN" ? (
          <form
            action={leadAssignmentAction}
            className="space-y-2 rounded border p-4"
          >
            {hidden}
            <h2 className="font-medium">Danışman atama</h2>
            <select
              name="advisorId"
              defaultValue={lead.assigned_advisor_id ?? ""}
            >
              <option value="">Atanmamış</option>
              {advisors.map((a: Advisor) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
            <button className="ml-2 rounded border px-3 py-1">Uygula</button>
          </form>
        ) : null}
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Yaklaşan randevular</h2>
        {lead.appointments.filter(
          (appointment: { starts_at: Date }) =>
            new Date(appointment.starts_at) >= new Date(),
        ).length === 0 ? (
          <p className="text-muted-foreground text-sm">Yaklaşan randevu yok.</p>
        ) : (
          <ol className="space-y-2">
            {lead.appointments
              .filter(
                (appointment: { starts_at: Date }) =>
                  new Date(appointment.starts_at) >= new Date(),
              )
              .map(
                (appointment: {
                  id: string;
                  status: string;
                  starts_at: Date;
                  ends_at: Date;
                  scheduled_timezone: string | null;
                  advisor_name: string | null;
                  property_title: string | null;
                }) => (
                  <li key={appointment.id} className="rounded border p-3">
                    <Link
                      className="underline"
                      href={`/admin/appointments/${appointment.id}`}
                    >
                      {appointment.status}
                    </Link>
                    <p>
                      {new Date(appointment.starts_at).toLocaleString("tr-TR")}{" "}
                      – {new Date(appointment.ends_at).toLocaleString("tr-TR")}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {appointment.advisor_name ?? "—"} ·{" "}
                      {appointment.property_title ?? "—"} ·{" "}
                      {appointment.scheduled_timezone ?? "—"}
                    </p>
                  </li>
                ),
              )}
          </ol>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Son / geçmiş randevular</h2>
        {lead.appointments.filter(
          (appointment: { starts_at: Date }) =>
            new Date(appointment.starts_at) < new Date(),
        ).length === 0 ? (
          <p className="text-muted-foreground text-sm">Geçmiş randevu yok.</p>
        ) : (
          <ol className="space-y-2">
            {lead.appointments
              .filter(
                (appointment: { starts_at: Date }) =>
                  new Date(appointment.starts_at) < new Date(),
              )
              .map(
                (appointment: {
                  id: string;
                  status: string;
                  starts_at: Date;
                  ends_at: Date;
                  scheduled_timezone: string | null;
                  advisor_name: string | null;
                  property_title: string | null;
                }) => (
                  <li key={appointment.id} className="rounded border p-3">
                    <Link
                      className="underline"
                      href={`/admin/appointments/${appointment.id}`}
                    >
                      {appointment.status}
                    </Link>
                    <p>
                      {new Date(appointment.starts_at).toLocaleString("tr-TR")}{" "}
                      – {new Date(appointment.ends_at).toLocaleString("tr-TR")}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {appointment.advisor_name ?? "—"} ·{" "}
                      {appointment.property_title ?? "—"} ·{" "}
                      {appointment.scheduled_timezone ?? "—"}
                    </p>
                  </li>
                ),
              )}
          </ol>
        )}
      </section>
      <section>
        <h2 className="font-semibold">Birleşik hareket akışı</h2>
        <ol className="mt-3 space-y-2">
          {lead.timeline.map((a: TimelineEntry) => (
            <li
              key={`${a.source}-${a.appointmentId ?? "lead"}-${a.occurredAt}-${a.eventType}`}
              className="rounded border p-3"
            >
              <b>
                {a.source === "appointment"
                  ? `RANDEVU · ${a.eventType}`
                  : a.eventType}
              </b>
              {a.appointmentId ? (
                <Link
                  className="ml-2 text-sm underline"
                  href={`/admin/appointments/${a.appointmentId}`}
                >
                  Randevuyu aç
                </Link>
              ) : null}
              {a.summary ? <p>{a.summary}</p> : null}
              <time className="text-muted-foreground text-xs">
                {new Date(a.occurredAt).toLocaleString("tr-TR")}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
