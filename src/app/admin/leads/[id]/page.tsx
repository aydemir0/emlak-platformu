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
import { LeadConversionForm } from "@/features/leads/components/lead-conversion-form";
import { resolutionKindLabel } from "@/features/leads/lead-conversion-presentation";
import {
  LEAD_STATE_TRANSITIONS,
  type LeadState,
} from "@/domain/leads/lead-lifecycle";
export const dynamic = "force-dynamic";
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
  const leadStatus = lead.status as LeadState;
  const statusOptions = [leadStatus, ...LEAD_STATE_TRANSITIONS[leadStatus]];
  const statusChangeAvailable = statusOptions.length > 1;
  const conversion = lead.conversion_customer_id
    ? {
        customerId: lead.conversion_customer_id as string,
        customerRequestId: lead.conversion_customer_request_id as string | null,
        outcome: lead.conversion_outcome as string,
        resolutionKind: lead.conversion_resolution_kind as string | null,
        convertedAt: lead.conversion_converted_at as Date,
      }
    : null;
  const conversionEligible = ["QUALIFIED", "VIEWING", "NEGOTIATION"].includes(
    lead.status,
  );
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
          <select
            name="status"
            defaultValue={lead.status}
            disabled={!statusChangeAvailable}
          >
            {statusOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            className="ml-2 rounded border px-3 py-1"
            disabled={!statusChangeAvailable}
          >
            Güncelle
          </button>
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
      {conversion ? (
        <section
          className="space-y-2 rounded border p-4"
          aria-labelledby="conversion-outcome"
        >
          <h2 id="conversion-outcome" className="font-semibold">
            Müşteri dönüşümü
          </h2>
          <p role="status">Dönüşüm kaydı değiştirilemez.</p>
          <p>{resolutionKindLabel(conversion.resolutionKind)}</p>
          <p className="text-sm">Müşteri referansı: {conversion.customerId}</p>
          {conversion.customerRequestId ? (
            <Link
              className="text-sm underline"
              href={`/admin/customer-requests/${conversion.customerRequestId}`}
            >
              Müşteri talebini aç
            </Link>
          ) : null}
          <time className="text-muted-foreground text-xs">
            {new Date(conversion.convertedAt).toLocaleString("tr-TR")}
          </time>
        </section>
      ) : lead.status === "WON" ? (
        <section className="border-destructive rounded border p-4" role="alert">
          <h2 className="font-semibold">Dönüşüm tutarsızlığı</h2>
          <p className="text-sm">
            Lead kazanılmış görünüyor ancak dönüşüm provenance kaydı yok.
            Otomatik düzeltme yapılmaz; yönetici incelemesi gerekir.
          </p>
        </section>
      ) : conversionEligible ? (
        <LeadConversionForm leadId={lead.id} idempotencyKey={randomUUID()} />
      ) : (
        <section
          className="rounded border p-4"
          aria-labelledby="conversion-unavailable"
        >
          <h2 id="conversion-unavailable" className="font-semibold">
            Müşteri dönüşümü
          </h2>
          <p className="text-muted-foreground text-sm">
            Bu lead mevcut yaşam döngüsü durumunda müşteriye dönüştürülemez.
          </p>
        </section>
      )}
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
