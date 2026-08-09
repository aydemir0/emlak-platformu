import Link from "next/link";

import type { PropertyListItem } from "@/application/properties/property-ports";

export function PropertyList({
  items,
}: Readonly<{ items: readonly PropertyListItem[] }>) {
  if (!items.length)
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-sm">
        Henüz ilan yok.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="p-3">Başlık</th>
            <th className="p-3">Tür</th>
            <th className="p-3">Fiyat</th>
            <th className="p-3">Konum</th>
            <th className="p-3">Danışman</th>
            <th className="p-3">Durum</th>
            <th className="p-3">Güncelleme</th>
            <th className="p-3">
              <span className="sr-only">İşlemler</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="p-3 font-medium">{item.title}</td>
              <td className="p-3">
                {item.listingTypeLabel} / {item.propertyTypeLabel}
              </td>
              <td className="p-3 tabular-nums">
                {item.priceAmountMinor === null
                  ? "—"
                  : `${item.priceAmountMinor.toString()} ${item.currencyCode} (minor)`}
              </td>
              <td className="p-3">{item.locationName}</td>
              <td className="p-3">{item.advisorNames.join(", ") || "—"}</td>
              <td className="p-3">
                <span className="bg-muted rounded-full px-2 py-1 text-xs font-medium">
                  {item.state}
                </span>
              </td>
              <td className="p-3">
                <time dateTime={item.updatedAt.toISOString()}>
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(item.updatedAt)}
                </time>
              </td>
              <td className="p-3">
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  href={`/admin/properties/${item.id}`}
                >
                  Düzenle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
