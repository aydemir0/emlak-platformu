import Link from "next/link";
import { notFound } from "next/navigation";

import { PostgresMatchingReadRepository } from "@/infrastructure/matching/postgres-matching.server";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { calculateMatchesAction } from "@/features/matching/matching-actions.server";
import {
  matchingCriterionLabel,
  matchingReasonLabel,
} from "@/features/matching/matching-presentation";

export const dynamic = "force-dynamic";

const labels = {
  listingType: "İşlem türü",
  location: "Konum",
  budget: "Bütçe",
  propertyType: "Emlak türü",
  rooms: "Oda",
  netArea: "Net alan",
  features: "Özellikler",
} as const;

export default async function CustomerRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await new PostgresMatchingReadRepository().get(await requireStaffPrincipal(), id);
  if (!model) notFound();
  const hasCurrent = model.results.some((result) => result.status !== "STALE");
  const hasStale = model.results.some((result) => result.status === "STALE");
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Müşteri talebi</h1><p className="text-muted-foreground text-sm">Deterministik ilan eşleşmeleri</p></header>
    <section className="rounded border p-4" aria-labelledby="matching-profile">
      <h2 id="matching-profile" className="font-semibold">Matching V2 profili</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => <div key={key}><dt className="text-muted-foreground text-sm">{label}</dt><dd>{matchingCriterionLabel(model.profile[key as keyof typeof model.profile])}</dd></div>)}
      </dl>
    </section>
    <section className="space-y-3" aria-labelledby="matching-results">
      <div className="flex items-center justify-between gap-3"><div><h2 id="matching-results" className="font-semibold">Eşleşmeler</h2><p role="status" className="text-muted-foreground text-sm">{hasStale ? "Eski sonuçlar mevcut; yeniden hesaplama önerilir." : hasCurrent ? "Sonuçlar güncel." : "Henüz hesaplama yapılmadı."}</p></div>
        <form action={calculateMatchesAction}><input type="hidden" name="customerRequestId" value={model.id}/><button className="rounded border px-3 py-2">{hasCurrent ? "Yeniden hesapla" : "Eşleşmeleri hesapla"}</button></form></div>
      {model.results.length === 0 ? <p className="text-muted-foreground rounded border p-4">Henüz kaydedilmiş eşleşme yok.</p> : <ol className="space-y-3">{model.results.map((result, index) => <li key={result.propertyId} className="rounded border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-muted-foreground text-sm">#{index + 1} · {result.status === "STALE" ? "Eski sonuç" : "Güncel sonuç"}</p><Link className="font-medium underline" href={`/admin/properties/${result.propertyId}`}>{result.propertyTitle ?? result.propertyReference ?? "Erişilemeyen ilan"}</Link></div><strong>{result.totalScore} / 100</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{Object.entries(result.components).map(([component, score]) => <div key={component}><dt className="text-muted-foreground">{labels[component as keyof typeof labels] ?? component}</dt><dd>{score}</dd></div>)}</dl><ul className="mt-3 list-disc pl-5 text-sm">{result.reasonCodes.map((code) => <li key={code}>{matchingReasonLabel(code)}</li>)}</ul></li>)}</ol>}
    </section>
  </section>;
}
