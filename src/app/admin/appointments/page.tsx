import Link from "next/link";
import { z } from "zod";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import {
  PostgresAppointmentReadRepository,
  type AppointmentListItem,
} from "@/infrastructure/appointments/postgres-appointments.server";

export const dynamic = "force-dynamic";
const query = z.object({
  page: z.coerce.number().int().positive().catch(1),
  period: z.enum(["upcoming", "past"]).optional(),
  status: z
    .enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"])
    .optional(),
  advisorId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
  leadId: z.uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = query.parse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    ),
  );
  const result = await new PostgresAppointmentReadRepository().list(
    await requireStaffPrincipal(),
    { ...parsed, limit: 25, offset: (parsed.page - 1) * 25 },
  );
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Randevular</h1>
        <p className="text-muted-foreground text-sm">
          Toplam {result.total} kayıt
        </p>
      </header>
      <form className="grid gap-2 rounded border p-3 md:grid-cols-4">
        <select name="period" defaultValue={parsed.period ?? ""}>
          <option value="">Tümü</option>
          <option value="upcoming">Yaklaşan</option>
          <option value="past">Geçmiş</option>
        </select>
        <select name="status" defaultValue={parsed.status ?? ""}>
          <option value="">Tüm durumlar</option>
          {["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
        <input name="from" type="datetime-local" aria-label="Başlangıç" />
        <input name="to" type="datetime-local" aria-label="Bitiş" />
        <button className="rounded border px-3 py-1">Filtrele</button>
      </form>
      {result.items.length === 0 ? (
        <p className="text-muted-foreground">Randevu bulunamadı.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Durum</th>
                <th>Başlangıç</th>
                <th>Lead</th>
                <th>İlan</th>
                <th>Danışman</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item: AppointmentListItem) => (
                <tr key={item.id} className="border-t">
                  <td>
                    <Link
                      className="underline"
                      href={`/admin/appointments/${item.id}`}
                    >
                      {item.status}
                    </Link>
                  </td>
                  <td>{new Date(item.starts_at).toLocaleString("tr-TR")}</td>
                  <td>{item.lead_name ?? item.lead_email ?? "—"}</td>
                  <td>{item.property_title ?? "—"}</td>
                  <td>{item.advisor_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
