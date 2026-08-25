"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ApplicationError,
  isReportableOperationalFailure,
  toPublicError,
} from "@/application/errors/application-error";
import { createPropertyDraft } from "@/application/properties/create-property-draft";
import { updateProperty } from "@/application/properties/update-property";
import { changePropertyPrice } from "@/application/properties/change-property-price";
import type { PropertyCommandContext } from "@/application/properties/property-contracts";
import { requireStaffPrincipal } from "@/infrastructure/auth/require-staff-principal.server";
import { PostgresPropertyUnitOfWork } from "@/infrastructure/properties/postgres-property-unit-of-work.server";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import {
  formDataToRecord,
  parsePropertyForm,
} from "@/features/properties/property-form-schema";
import { createRequestContext } from "@/lib/request-context";
import type { RequestContext } from "@/lib/request-context";

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
  requestContext: RequestContext,
): Promise<PropertyCommandContext> {
  const actor = await requireStaffPrincipal();
  return {
    actor,
    ...requestContext,
    idempotencyKey: z
      .uuid()
      .catch(randomUUID())
      .parse(formData.get("idempotencyKey")),
  };
}

async function propertyRequestContext(): Promise<RequestContext> {
  return createRequestContext(await headers());
}

function safeFailure(
  error: unknown,
  operation: "property.create" | "property.price-change" | "property.update",
  correlationId?: string,
): PropertyActionState {
  if (isReportableOperationalFailure(error)) {
    reportUnexpectedError(error, { correlationId, operation });
  }
  if (error instanceof ApplicationError) {
    const outwardError = isReportableOperationalFailure(error)
      ? new ApplicationError(error.code, error.code, { correlationId })
      : error.code === "PROPERTY_FORBIDDEN" ||
          error.code === "PROPERTY_NOT_FOUND"
        ? new ApplicationError("PROPERTY_NOT_FOUND", "PROPERTY_NOT_FOUND", {
            correlationId: error.correlationId,
          })
        : error;
    return { ok: false, error: toPublicError(outwardError) };
  }
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
  let correlationId: string | undefined;
  try {
    const parsed = parsePropertyForm(formDataToRecord(formData));
    const requestContext = await propertyRequestContext();
    correlationId = requestContext.correlationId;
    const context = await commandContext(formData, requestContext);
    const property = await createPropertyDraft(uow, context, parsed);
    propertyId = property.id;
  } catch (error) {
    return safeFailure(error, "property.create", correlationId);
  }
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${propertyId}`);
}

export async function updatePropertyAction(
  _previous: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  let correlationId: string | undefined;
  try {
    const identity = propertyIdentitySchema.parse(formDataToRecord(formData));
    const parsed = parsePropertyForm(formDataToRecord(formData));
    const requestContext = await propertyRequestContext();
    correlationId = requestContext.correlationId;
    await updateProperty(uow, await commandContext(formData, requestContext), {
      ...parsed,
      ...identity,
    });
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${identity.propertyId}`);
    return { ok: true };
  } catch (error) {
    return safeFailure(error, "property.update", correlationId);
  }
}

export async function changePropertyPriceAction(
  _previous: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  let correlationId: string | undefined;
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
    const requestContext = await propertyRequestContext();
    correlationId = requestContext.correlationId;
    await changePropertyPrice(
      uow,
      await commandContext(formData, requestContext),
      {
        ...identity,
        ...price,
        source: "STAFF_FORM",
        effectiveAt: new Date(),
      },
    );
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${identity.propertyId}`);
    return { ok: true };
  } catch (error) {
    return safeFailure(error, "property.price-change", correlationId);
  }
}
