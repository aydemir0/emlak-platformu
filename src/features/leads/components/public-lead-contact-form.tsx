"use client";

import { useActionState, useState } from "react";

import {
  createPublicLeadAction,
  type PublicLeadActionState,
} from "@/features/leads/public-lead-actions.server";

const initialState: PublicLeadActionState = { accepted: false };

export function PublicLeadContactForm({
  propertyId,
}: Readonly<{ propertyId: string }>) {
  const [state, action, pending] = useActionState(
    createPublicLeadAction,
    initialState,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form action={action} className="space-y-3">
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <label className="grid gap-1 text-sm">
        Adınız
        <input
          className="rounded border px-3 py-2"
          maxLength={160}
          name="name"
        />
      </label>
      <label className="grid gap-1 text-sm">
        E-posta
        <input
          className="rounded border px-3 py-2"
          maxLength={320}
          name="email"
          type="email"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Telefon
        <input
          className="rounded border px-3 py-2"
          maxLength={64}
          name="phone"
          type="tel"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Mesajınız
        <textarea
          className="rounded border px-3 py-2"
          maxLength={4000}
          name="message"
          rows={4}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input name="consentAccepted" required type="checkbox" />
        İletişim talebim için bilgilerimin işlenmesini kabul ediyorum.
      </label>
      <button
        className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2"
        disabled={pending}
        type="submit"
      >
        {pending ? "Gönderiliyor…" : "Danışmana ulaş"}
      </button>
      {state.accepted ? <p aria-live="polite">Talebiniz alındı.</p> : null}
      {state.error ? (
        <p aria-live="polite">Lütfen zorunlu alanları kontrol edin.</p>
      ) : null}
    </form>
  );
}
