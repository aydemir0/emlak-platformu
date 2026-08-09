import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { PropertyForm } from "@/features/properties/components/property-form";
import { PropertyPriceForm } from "@/features/properties/components/property-price-form";
import { getPropertyEditorData } from "@/features/properties/property-queries.server";

export const dynamic = "force-dynamic";

export default async function PropertyPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const { property, references } = await getPropertyEditorData(id);
  if (!property) notFound();
  const initial = {
    title: property.title,
    listingTypeId: property.listingTypeId,
    propertyTypeId: property.propertyTypeId,
    locationId: property.locationId,
    heatingTypeId: property.heatingTypeId,
    description: property.description,
    shortDescription: property.shortDescription,
    grossAreaSqm: property.grossAreaSqm?.toString() ?? null,
    netAreaSqm: property.netAreaSqm?.toString() ?? null,
    livingRoomCount: property.livingRoomCount?.toString() ?? null,
    bedroomCount: property.bedroomCount?.toString() ?? null,
    bathroomCount: property.bathroomCount?.toString() ?? null,
    buildingAgeYears: property.buildingAgeYears?.toString() ?? null,
    floorNumber: property.floorNumber?.toString() ?? null,
    totalFloorCount: property.totalFloorCount?.toString() ?? null,
    furnished: property.furnished,
    addressLine: property.addressLine,
    latitude: property.latitude?.toString() ?? null,
    longitude: property.longitude?.toString() ?? null,
  };
  return (
    <section className="space-y-6">
      <header>
        <p className="text-muted-foreground text-sm">
          {property.publicId} · {property.currentState} · v
          {property.version.toString()}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">İlanı düzenle</h1>
      </header>
      <div className="bg-background rounded-lg border p-6">
        <PropertyForm
          mode="edit"
          idempotencyKey={randomUUID()}
          propertyId={property.id}
          expectedVersion={property.version.toString()}
          initial={initial}
          references={references}
        />
      </div>
      <PropertyPriceForm
        propertyId={property.id}
        expectedVersion={property.version.toString()}
        idempotencyKey={randomUUID()}
        amountMinor={property.priceAmountMinor?.toString() ?? null}
        currencyCode={property.currencyCode}
      />
    </section>
  );
}
