"use server";

import { createHmac, randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { ApplicationError } from "@/application/errors/application-error";
import { createPublicLead } from "@/application/leads/create-public-lead";
import { getServerEnv } from "@/config/env.server.runtime";
import { parsePublicLeadForm } from "@/domain/leads/public-lead-intake";
import { PostgresPublicLeadUnitOfWork } from "@/infrastructure/leads/postgres-public-lead-unit-of-work.server";

export type PublicLeadActionState = Readonly<{
  accepted: boolean;
  error?: "LEAD_VALIDATION_FAILED";
}>;

const accepted: PublicLeadActionState = { accepted: true };

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function clientNetworkAddress(requestHeaders: Headers): string {
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unavailable"
  );
}

function fingerprintInput(
  form: ReturnType<typeof parsePublicLeadForm>,
): string {
  return JSON.stringify({
    propertyId: form.propertyId,
    email: form.email?.toLocaleLowerCase("en-US") ?? null,
    phone: form.phone ?? null,
    name: form.name ?? null,
    message: form.message ?? null,
    consentAccepted: true,
  });
}

export interface LeadChallengeVerifier {
  verify(
    input: Readonly<{ token: string | undefined; networkSignal: string }>,
  ): Promise<boolean>;
}

// A provider is intentionally not activated in V1. This is the narrow future boundary.
const optionalChallengeVerifier: LeadChallengeVerifier = {
  async verify() {
    return true;
  },
};

export async function createPublicLeadAction(
  _previous: PublicLeadActionState,
  formData: FormData,
): Promise<PublicLeadActionState> {
  try {
    const form = parsePublicLeadForm(Object.fromEntries(formData));
    const requestHeaders = await headers();
    const env = getServerEnv();
    const networkSignal = hmac(
      env.LEAD_INTAKE_HMAC_SECRET,
      clientNetworkAddress(requestHeaders),
    );
    if (
      !(await optionalChallengeVerifier.verify({
        token: form.challengeToken,
        networkSignal,
      }))
    ) {
      return accepted;
    }
    await createPublicLead(
      new PostgresPublicLeadUnitOfWork(undefined, {
        maximumAttempts: env.LEAD_RATE_LIMIT_MAX_ATTEMPTS,
        windowMilliseconds: env.LEAD_RATE_LIMIT_WINDOW_SECONDS * 1_000,
      }),
      {
        propertyId: form.propertyId,
        email: form.email,
        phone: form.phone,
        name: form.name,
        message: form.message,
        consentAccepted: true,
        idempotencyKey: form.idempotencyKey,
        idempotencyFingerprint: hmac(
          env.LEAD_INTAKE_HMAC_SECRET,
          fingerprintInput(form),
        ),
        correlationId: randomUUID(),
        requestId: requestHeaders.get("x-request-id") ?? randomUUID(),
        abuseNetworkSignal: networkSignal,
      },
    );
    return accepted;
  } catch (error) {
    if (error instanceof ApplicationError) {
      if (error.code === "LEAD_VALIDATION_FAILED") {
        return { accepted: false, error: "LEAD_VALIDATION_FAILED" };
      }
      // Publicly indistinguishable for property visibility, idempotency conflict, and abuse denial.
      return accepted;
    }
    return { accepted: false, error: "LEAD_VALIDATION_FAILED" };
  }
}
