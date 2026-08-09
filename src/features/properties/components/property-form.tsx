"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createPropertyAction,
  updatePropertyAction,
  type PropertyActionState,
} from "@/features/properties/property-actions.server";

type Option = Readonly<{ id: string; label: string }>;
type PropertyFormProps = Readonly<{
  mode: "create" | "edit";
  idempotencyKey: string;
  propertyId?: string;
  expectedVersion?: string;
  initial?: Partial<Record<string, string | boolean | null>>;
  references: {
    listingTypes: readonly Option[];
    propertyTypes: readonly Option[];
    locations: ReadonlyArray<{
      id: string;
      name: string;
      level: "CITY" | "DISTRICT" | "NEIGHBORHOOD";
      parentId: string | null;
    }>;
    heatingTypes: readonly Option[];
    advisors: ReadonlyArray<{ id: string; name: string }>;
  };
}>;

const initialState: PropertyActionState = { ok: false };
const inputClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export function PropertyForm(props: PropertyFormProps) {
  const action =
    props.mode === "create" ? createPropertyAction : updatePropertyAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const dirty = useRef(false);
  useEffect(() => {
    if (state.ok) dirty.current = false;
  }, [state.ok]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const blocked =
    props.references.propertyTypes.length === 0 ||
    props.references.locations.length === 0;

  return (
    <form
      action={formAction}
      className="space-y-6"
      onChange={() => {
        dirty.current = true;
      }}
    >
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
      <input type="hidden" name="propertyId" value={props.propertyId ?? ""} />
      <input
        type="hidden"
        name="expectedVersion"
        value={props.expectedVersion ?? ""}
      />
      <input type="hidden" name="locationVisibility" value="" />
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error.message}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm">
          Değişiklik kaydedildi.
        </p>
      ) : null}
      {blocked ? (
        <div className="bg-muted rounded-md p-4 text-sm">
          İlan oluşturmak için önce en az bir property type ve location
          reference kaydı tanımlanmalıdır.
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Başlık">
          <input
            className={inputClass}
            name="title"
            required
            defaultValue={props.initial?.title?.toString() ?? ""}
          />
        </Field>
        <Field label="İlan türü">
          <select
            className={inputClass}
            name="listingTypeId"
            required
            defaultValue={props.initial?.listingTypeId?.toString() ?? ""}
          >
            <option value="">Seçin</option>
            {props.references.listingTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Emlak türü">
          <select
            className={inputClass}
            name="propertyTypeId"
            required
            defaultValue={props.initial?.propertyTypeId?.toString() ?? ""}
          >
            <option value="">Seçin</option>
            {props.references.propertyTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <LocationFields
          locations={props.references.locations}
          initialLocationId={props.initial?.locationId?.toString() ?? null}
        />
        <Field label="Isınma türü">
          <select
            className={inputClass}
            name="heatingTypeId"
            defaultValue={props.initial?.heatingTypeId?.toString() ?? ""}
          >
            <option value="">Belirtilmedi</option>
            {props.references.heatingTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {props.references.heatingTypes.length === 0 ? (
            <small className="text-muted-foreground">
              Henüz ısınma türü tanımlı değil.
            </small>
          ) : null}
        </Field>
        <Field label="Kısa açıklama">
          <input
            className={inputClass}
            name="shortDescription"
            defaultValue={props.initial?.shortDescription?.toString() ?? ""}
          />
        </Field>
        <Field label="Brüt alan (m²)">
          <input
            className={inputClass}
            name="grossAreaSqm"
            type="number"
            min="0"
            step="0.01"
            defaultValue={props.initial?.grossAreaSqm?.toString() ?? ""}
          />
        </Field>
        <Field label="Net alan (m²)">
          <input
            className={inputClass}
            name="netAreaSqm"
            type="number"
            min="0"
            step="0.01"
            defaultValue={props.initial?.netAreaSqm?.toString() ?? ""}
          />
        </Field>
        <Field label="Salon sayısı">
          <input
            className={inputClass}
            name="livingRoomCount"
            type="number"
            min="0"
            step="1"
            defaultValue={props.initial?.livingRoomCount?.toString() ?? ""}
          />
        </Field>
        <Field label="Oda sayısı">
          <input
            className={inputClass}
            name="bedroomCount"
            type="number"
            min="0"
            step="1"
            defaultValue={props.initial?.bedroomCount?.toString() ?? ""}
          />
        </Field>
        <Field label="Banyo sayısı">
          <input
            className={inputClass}
            name="bathroomCount"
            type="number"
            min="0"
            step="1"
            defaultValue={props.initial?.bathroomCount?.toString() ?? ""}
          />
        </Field>
        <Field label="Bina yaşı">
          <input
            className={inputClass}
            name="buildingAgeYears"
            type="number"
            min="0"
            step="1"
            defaultValue={props.initial?.buildingAgeYears?.toString() ?? ""}
          />
        </Field>
        <Field label="Kat">
          <input
            className={inputClass}
            name="floorNumber"
            type="number"
            step="1"
            defaultValue={props.initial?.floorNumber?.toString() ?? ""}
          />
        </Field>
        <Field label="Toplam kat">
          <input
            className={inputClass}
            name="totalFloorCount"
            type="number"
            min="0"
            step="1"
            defaultValue={props.initial?.totalFloorCount?.toString() ?? ""}
          />
        </Field>
        <Field label="Eşyalı">
          <select
            className={inputClass}
            name="furnished"
            defaultValue={
              props.initial?.furnished == null
                ? ""
                : String(props.initial.furnished)
            }
          >
            <option value="">Belirtilmedi</option>
            <option value="true">Evet</option>
            <option value="false">Hayır</option>
          </select>
        </Field>
        <Field label="Adres">
          <input
            className={inputClass}
            name="addressLine"
            defaultValue={props.initial?.addressLine?.toString() ?? ""}
          />
        </Field>
        <Field label="Enlem">
          <input
            className={inputClass}
            name="latitude"
            type="number"
            min="-90"
            max="90"
            step="0.000001"
            defaultValue={props.initial?.latitude?.toString() ?? ""}
          />
        </Field>
        <Field label="Boylam">
          <input
            className={inputClass}
            name="longitude"
            type="number"
            min="-180"
            max="180"
            step="0.000001"
            defaultValue={props.initial?.longitude?.toString() ?? ""}
          />
        </Field>
        <Field label="Danışman">
          <select
            className={inputClass}
            disabled
            aria-describedby="advisor-open-decision"
          >
            <option>Atama ayrı komutla yapılır</option>
            {props.references.advisors.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
          <small id="advisor-open-decision" className="text-muted-foreground">
            Assignment role/cardinality kararı kilitlenene kadar formdan
            sahiplik yükseltmesi yapılamaz.
          </small>
        </Field>
      </div>
      <Field label="Açıklama">
        <textarea
          className="border-input bg-background min-h-32 w-full rounded-md border p-3 text-sm"
          name="description"
          defaultValue={props.initial?.description?.toString() ?? ""}
        />
      </Field>
      {props.mode === "create" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Fiyat (minor unit)">
            <input
              className={inputClass}
              name="priceAmountMinor"
              type="number"
              min="0"
              step="1"
            />
          </Field>
          <Field label="Para birimi">
            <input
              className={inputClass}
              name="currencyCode"
              maxLength={3}
              placeholder="TRY"
            />
          </Field>
        </div>
      ) : (
        <>
          <input type="hidden" name="priceAmountMinor" value="" />
          <input type="hidden" name="currencyCode" value="" />
        </>
      )}
      <section className="bg-muted rounded-md p-4 text-sm" aria-label="Medya">
        <p className="font-medium">Medya</p>
        <p className="text-muted-foreground mt-1">
          Görsel yükleme ve sıralama sonraki fazda güvenli medya akışıyla
          eklenecektir.
        </p>
      </section>
      <Button type="submit" disabled={blocked || pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}

function LocationFields({
  locations,
  initialLocationId,
}: Readonly<{
  locations: PropertyFormProps["references"]["locations"];
  initialLocationId: string | null;
}>) {
  const initial = locations.find((item) => item.id === initialLocationId);
  const initialDistrict =
    initial?.level === "NEIGHBORHOOD"
      ? locations.find((item) => item.id === initial.parentId)
      : initial?.level === "DISTRICT"
        ? initial
        : undefined;
  const initialCity =
    initial?.level === "CITY"
      ? initial
      : locations.find((item) => item.id === initialDistrict?.parentId);
  const [cityId, setCityId] = useState(initialCity?.id ?? "");
  const [districtId, setDistrictId] = useState(initialDistrict?.id ?? "");
  const [neighborhoodId, setNeighborhoodId] = useState(
    initial?.level === "NEIGHBORHOOD" ? initial.id : "",
  );
  const districts = locations.filter(
    (item) => item.level === "DISTRICT" && item.parentId === cityId,
  );
  const neighborhoods = locations.filter(
    (item) => item.level === "NEIGHBORHOOD" && item.parentId === districtId,
  );
  const selectedLocationId = neighborhoodId || districtId || cityId;
  return (
    <>
      <input type="hidden" name="locationId" value={selectedLocationId} />
      <Field label="Şehir">
        <select
          className={inputClass}
          required
          value={cityId}
          onChange={(event) => {
            setCityId(event.target.value);
            setDistrictId("");
            setNeighborhoodId("");
          }}
        >
          <option value="">Seçin</option>
          {locations
            .filter((item) => item.level === "CITY")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="İlçe">
        <select
          className={inputClass}
          value={districtId}
          disabled={!cityId}
          onChange={(event) => {
            setDistrictId(event.target.value);
            setNeighborhoodId("");
          }}
        >
          <option value="">Belirtilmedi</option>
          {districts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mahalle">
        <select
          className={inputClass}
          value={neighborhoodId}
          disabled={!districtId}
          onChange={(event) => setNeighborhoodId(event.target.value)}
        >
          <option value="">Belirtilmedi</option>
          {neighborhoods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
