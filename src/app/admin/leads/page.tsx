import Link from "next/link";
import { z } from "zod";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresLeadCrmReadRepository } from "@/infrastructure/leads/postgres-lead-crm.server";

type LeadListItem = {
  id: string;
  status: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_title: string | null;
  advisor_name: string | null;
  updated_at: Date;
};
export const dynamic = "force-dynamic";
const schema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  status: z.string().max(32).optional(),
  advisorId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(100).optional(),
});
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const p = schema.parse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    ),
  );
  const repo = new PostgresLeadCrmReadRepository();
  const actor = await requireStaffPrincipal();
  const pageSize = 25;
  const result = await repo.list(actor, {
    ...p,
    limit: pageSize,
    offset: (p.page - 1) * pageSize,
  });
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Leadler</h1>
        <p className="text-muted-foreground text-sm">
          Toplam {result.total} kayıt
        </p>
      </header>
      <form className="grid gap-2 rounded border p-3 md:grid-cols-4">
        <input
          name="search"
          defaultValue={p.search}
          placeholder="Ad, e-posta veya telefon"
          className="rounded border px-2 py-1"
        />
        <select name="status" defaultValue={p.status ?? ""}>
          <option value="">Tüm durumlar</option>
          {[
            "NEW",
            "CONTACTED",
            "QUALIFIED",
            "VIEWING",
            "NEGOTIATION",
            "WON",
            "LOST",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input name="from" type="datetime-local" />
        <input name="to" type="datetime-local" />
        <button className="rounded border px-3 py-1">Filtrele</button>
      </form>
      {result.items.length === 0 ? (
        <p className="text-muted-foreground">Kayıt bulunamadı.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Durum</th>
                <th>İletişim</th>
                <th>İlan</th>
                <th>Danışman</th>
                <th>Güncelleme</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((x: LeadListItem) => (
                <tr key={x.id} className="border-t">
                  <td>
                    <Link className="underline" href={`/admin/leads/${x.id}`}>
                      {x.status}
                    </Link>
                  </td>
                  <td>{x.name ?? x.email ?? x.phone ?? "—"}</td>
                  <td>{x.property_title ?? "Erişilemeyen ilan"}</td>
                  <td>{x.advisor_name ?? "Atanmamış"}</td>
                  <td>{new Date(x.updated_at).toLocaleString("tr-TR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
