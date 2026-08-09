import Link from "next/link";
import { z } from "zod";

import { PropertyList } from "@/features/properties/components/property-list";
import { getPropertyListPageData } from "@/features/properties/property-queries.server";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  status: z
    .enum([
      "DRAFT",
      "REVIEW",
      "ACTIVE",
      "RESERVED",
      "SOLD",
      "RENTED",
      "PASSIVE",
      "ARCHIVED",
    ])
    .optional()
    .catch(undefined),
  listingTypeId: z.uuid().optional().catch(undefined),
  advisorId: z.uuid().optional().catch(undefined),
  locationId: z.uuid().optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  sort: z
    .enum(["updated_desc", "updated_asc", "price_desc", "price_asc"])
    .optional()
    .catch("updated_desc"),
});

export default async function PropertiesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const raw = await searchParams;
  const parsed = searchSchema.parse(
    Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  );
  const { page, ...filters } = parsed;
  const result = await getPropertyListPageData(page, filters);
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value)
      .map(([key, value]) => [key, String(value)]),
  );
  const pageHref = (target: number) => {
    const copy = new URLSearchParams(query);
    copy.set("page", String(target));
    return `/admin/properties?${copy}`;
  };
  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">İlanlar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Toplam {result.total} kayıt
          </p>
        </div>
        <Link
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          href="/admin/properties/new"
        >
          Yeni ilan
        </Link>
      </header>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-3 lg:grid-cols-6">
        <input
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="search"
          defaultValue={filters.search}
          placeholder="Başlık veya public ID"
          aria-label="Ara"
        />
        <select
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="status"
          defaultValue={filters.status ?? ""}
          aria-label="Durum"
        >
          <option value="">Tüm durumlar</option>
          {[
            "DRAFT",
            "REVIEW",
            "ACTIVE",
            "RESERVED",
            "SOLD",
            "RENTED",
            "PASSIVE",
            "ARCHIVED",
          ].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
        <select
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="listingTypeId"
          defaultValue={filters.listingTypeId ?? ""}
          aria-label="İlan türü"
        >
          <option value="">Tüm ilan türleri</option>
          {result.references.listingTypes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="advisorId"
          defaultValue={filters.advisorId ?? ""}
          aria-label="Danışman"
        >
          <option value="">Tüm danışmanlar</option>
          {result.references.advisors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="locationId"
          defaultValue={filters.locationId ?? ""}
          aria-label="Konum"
        >
          <option value="">Tüm konumlar</option>
          {result.references.locations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="border-input rounded-md border px-3 py-2 text-sm"
          name="sort"
          defaultValue={filters.sort}
          aria-label="Sıralama"
        >
          <option value="updated_desc">Son güncellenen</option>
          <option value="updated_asc">İlk güncellenen</option>
          <option value="price_desc">Fiyat azalan</option>
          <option value="price_asc">Fiyat artan</option>
        </select>
        <button
          className="rounded-md border px-3 py-2 text-sm font-medium"
          type="submit"
        >
          Filtrele
        </button>
      </form>
      <PropertyList items={result.items} />
      <nav className="flex justify-between" aria-label="Sayfalama">
        {page > 1 ? <Link href={pageHref(page - 1)}>Önceki</Link> : <span />}
        {page * result.pageSize < result.total ? (
          <Link href={pageHref(page + 1)}>Sonraki</Link>
        ) : null}
      </nav>
    </section>
  );
}
