import { randomUUID } from "node:crypto";

import { PropertyForm } from "@/features/properties/components/property-form";
import { getPropertyReferenceData } from "@/features/properties/property-queries.server";

export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const references = await getPropertyReferenceData();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Yeni ilan taslağı</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Yayınlama ayrı, yetkilendirilmiş bir lifecycle komutudur.
        </p>
      </header>
      <div className="bg-background rounded-lg border p-6">
        <PropertyForm
          mode="create"
          idempotencyKey={randomUUID()}
          references={references}
        />
      </div>
    </section>
  );
}
