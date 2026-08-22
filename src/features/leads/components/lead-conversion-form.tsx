"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { convertLeadToCustomerAction } from "@/features/leads/lead-conversion-actions.server";
import {
  initialLeadConversionActionState,
  leadConversionErrorMessage,
  resolutionKindLabel,
} from "@/features/leads/lead-conversion-presentation";

export function LeadConversionForm(
  props: Readonly<{ leadId: string; idempotencyKey: string }>,
) {
  const [state, action, pending] = useActionState(
    convertLeadToCustomerAction,
    initialLeadConversionActionState,
  );
  const [mode, setMode] = useState<"automatic" | "explicit">("automatic");

  return (
    <section
      className="space-y-3 rounded border p-4"
      aria-labelledby="conversion-heading"
    >
      <div>
        <h2 id="conversion-heading" className="font-semibold">
          Müşteriye dönüştür
        </h2>
        <p className="text-muted-foreground text-sm">
          Dönüşüm açık bir işlemdir; lead geçmiş kaydı korunur.
        </p>
      </div>
      <form action={action} className="space-y-3">
        <input name="leadId" type="hidden" value={props.leadId} />
        <input
          name="idempotencyKey"
          type="hidden"
          value={props.idempotencyKey}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Müşteri çözümleme yöntemi
          </legend>
          <label className="flex gap-2 text-sm">
            <input
              checked={mode === "automatic"}
              name="conversionMode"
              onChange={() => setMode("automatic")}
              type="radio"
              value="automatic"
            />
            Doğrulanmış iletişim bilgileriyle otomatik çözümle
          </label>
          <label className="flex gap-2 text-sm">
            <input
              checked={mode === "explicit"}
              name="conversionMode"
              onChange={() => setMode("explicit")}
              type="radio"
              value="explicit"
            />
            Yetkili mevcut müşteri referansını kullan
          </label>
        </fieldset>
        {mode === "explicit" ? (
          <div className="grid gap-1 text-sm">
            <label htmlFor="explicit-customer-id">
              Mevcut müşteri referansı
            </label>
            <input
              className="rounded border px-3 py-2"
              id="explicit-customer-id"
              name="explicitCustomerId"
              placeholder="UUID"
              required
            />
            <span className="text-muted-foreground text-xs">
              Erişim yetkisi sunucuda doğrulanır; yetkisiz kayıtlar gösterilmez.
            </span>
          </div>
        ) : null}
        <label className="flex gap-2 text-sm">
          <input name="createInitialRequest" type="checkbox" />
          İlk müşteri talebini oluştur
        </label>
        <p className="text-muted-foreground text-xs">
          Talep oluşturulursa Matching V2 tercihleri otomatik çıkarılmaz.
        </p>
        <Button disabled={pending} type="submit">
          {pending ? "Dönüştürülüyor…" : "Müşteriye dönüştür"}
        </Button>
        {state.ok && state.result ? (
          <div className="rounded border p-3 text-sm" role="status">
            <p className="font-medium">Dönüştürme tamamlandı.</p>
            <p>{resolutionKindLabel(state.result.resolutionKind)}</p>
            <p>Müşteri referansı: {state.result.customerId}</p>
            {state.result.customerRequestId ? (
              <a
                className="underline"
                href={`/admin/customer-requests/${state.result.customerRequestId}`}
              >
                Oluşturulan müşteri talebini aç
              </a>
            ) : null}
          </div>
        ) : null}
        {!state.ok && state.error ? (
          <p className="text-destructive text-sm" role="status">
            {leadConversionErrorMessage(state.error)}
          </p>
        ) : null}
      </form>
    </section>
  );
}
