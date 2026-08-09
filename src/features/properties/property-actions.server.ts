"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ApplicationError,
  toPublicError,
} from "@/application/errors/application-error";
import { createPropertyDraft } from "@/application/properties/create-property-draft";
import { updateProperty } from "@/application/properties/update-property";
import { changePropertyPrice } from "@/application/properties/change-property-price";
import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresPropertyUnitOfWork } from "@/infrastructure/properties/postgres-property-unit-of-work.server";
import {
  formDataToRecord,
  parsePropertyForm,
} from "@/features/properties/property-form-schema";

export type PropertyActionState = Readonly<{
  ok: boolean;
  error?: { code: string; message: string; correlationId?: string };
}>;

const uow = new PostgresPropertyUnitOfWork();
const propertyIdentitySchema = z.object({
  propertyId: z.uuid(),
  expectedVersion: z.coerce.bigint().positive(),
});

async function commandContext(
  formData: FormData,
): Promise<PropertyCommandContext> {
  const actor = await requireStaffPrincipal();
  const requestHeaders = await headers();
  return {
    actor,
    correlationId: randomUUID(),
    requestId: requestHeaders.get("x-request-id") ?? randomUUID(),
    idempotencyKey: z
      .uuid()
      .catch(randomUUID())
      .parse(formData.get("idempotencyKey")),
  };
}

function safeFailure(error: unknown): PropertyActionState {
  if (error instanceof ApplicationError)
    return { ok: false, error: toPublicError(error) };
  if (error instanceof z.ZodError)
    return {
      ok: false,
      error: {
        code: "PROPERTY_VALIDATION_FAILED",
        message: "Form values are invalid",
      },
    };
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Operation could not be completed" },
  };
}

export async function createPropertyAction(
  _previous: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  let propertyId: string | undefined;
  try {
    const parsed = parsePropertyForm(formDataToRecord(formData));
    const context = await commandContext(formData);
    const property = await createPropertyDraft(uow, context, parsed);
    propertyId = property.id;
  } catch (error) {
    return safeFailure(error);
  }
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${propertyId}`);
}

export async function updatePropertyAction(
  _previous: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  try {
    const identity = propertyIdentitySchema.parse(formDataToRecord(formData));
    const parsed = parsePropertyForm(formDataToRecord(formData));
    await updateProperty(uow, await commandContext(formData), {
      ...parsed,
      ...identity,
    });
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${identity.propertyId}`);
    return { ok: true };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function changePropertyPriceAction(
  _previous: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  try {
    const values = formDataToRecord(formData);
    const identity = propertyIdentitySchema.parse(values);
    const price = z
      .object({
        amountMinor: z.coerce.bigint().nonnegative(),
        currencyCode: z.string().regex(/^[A-Z]{3}$/),
        reasonCode: z.preprocess(
          (value) => (value === "" ? null : value),
          z.string().trim().min(1).nullable(),
        ),
      })
      .parse(values);
    await changePropertyPrice(uow, await commandContext(formData), {
      ...identity,
      ...price,
      source: "STAFF_FORM",
      effectiveAt: new Date(),
    });
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${identity.propertyId}`);
    return { ok: true };
  } catch (error) {
    return safeFailure(error);
  }
}
