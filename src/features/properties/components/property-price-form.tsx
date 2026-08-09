"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  changePropertyPriceAction,
  type PropertyActionState,
} from "@/features/properties/property-actions.server";

const initialState: PropertyActionState = { ok: false };

export function PropertyPriceForm({
  propertyId,
  expectedVersion,
  idempotencyKey,
  amountMinor,
  currencyCode,
}: Readonly<{
  propertyId: string;
  expectedVersion: string;
  idempotencyKey: string;
  amountMinor: string | null;
  currencyCode: string | null;
}>) {
  const [state, action, pending] = useActionState(
    changePropertyPriceAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-4 rounded-lg border p-6">
      <h2 className="font-semibold">Fiyat değiştir</h2>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="reasonCode" value="" />
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error.message}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm">
          Fiyat geçmişiyle birlikte kaydedildi.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Fiyat (minor unit)</span>
          <input
            className="border-input h-9 rounded-md border px-3"
            name="amountMinor"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={amountMinor ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Para birimi</span>
          <input
            className="border-input h-9 rounded-md border px-3 uppercase"
            name="currencyCode"
            required
            maxLength={3}
            defaultValue={currencyCode ?? ""}
          />
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Fiyatı kaydet"}
      </Button>
    </form>
  );
}
