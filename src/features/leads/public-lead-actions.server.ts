"use server";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { ApplicationError } from "@/application/errors/application-error";
import { createPublicLead } from "@/application/leads/create-public-lead";
import { getServerEnv } from "@/config/env.server.runtime";
import { parsePublicLeadForm } from "@/domain/leads/public-lead-intake";
import { PostgresPublicLeadUnitOfWork } from "@/infrastructure/leads/postgres-public-lead-unit-of-work.server";
import { reportUnexpectedError } from "@/infrastructure/observability/runtime-observability.server";
import { createRequestContext } from "@/lib/request-context";

export type PublicLeadActionState = Readonly<{
  accepted: boolean;
  error?: "LEAD_VALIDATION_FAILED" | "LEAD_INTAKE_UNAVAILABLE";
}>;

const accepted: PublicLeadActionState = { accepted: true };

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

const unavailableNetworkSource = "network-source-unavailable";

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
  ): Promise<"VERIFIED" | "REJECTED" | "UNAVAILABLE">;
}

// No provider is selected. This boundary must never represent absence as success.
const unconfiguredChallengeVerifier: LeadChallengeVerifier = {
  async verify() {
    return "UNAVAILABLE";
  },
};

function challengeOutcome(
  appEnvironment: string,
  verification: Awaited<ReturnType<LeadChallengeVerifier["verify"]>>,
): "ALLOW" | "REJECT" | "UNAVAILABLE" {
  if (verification === "VERIFIED") return "ALLOW";
  if (verification === "REJECTED") return "REJECT";
  return appEnvironment === "local" || appEnvironment === "test"
    ? "ALLOW"
    : "UNAVAILABLE";
}

export async function createPublicLeadAction(
  _previous: PublicLeadActionState,
  formData: FormData,
): Promise<PublicLeadActionState> {
  let form: ReturnType<typeof parsePublicLeadForm>;
  try {
    form = parsePublicLeadForm(Object.fromEntries(formData));
  } catch {
    return { accepted: false, error: "LEAD_VALIDATION_FAILED" };
  }
  if (form.companyWebsite !== undefined) return accepted;

  let correlationId: string | undefined;
  try {
    const requestHeaders = await headers();
    const requestContext = createRequestContext(requestHeaders);
    correlationId = requestContext.correlationId;
    const env = getServerEnv();
    const networkSignal = hmac(
      env.LEAD_INTAKE_HMAC_SECRET,
      unavailableNetworkSource,
    );
    const challenge = await unconfiguredChallengeVerifier.verify({
      token: form.challengeToken,
      networkSignal,
    });
    const outcome = challengeOutcome(env.APP_ENV, challenge);
    if (outcome === "UNAVAILABLE") {
      return { accepted: false, error: "LEAD_INTAKE_UNAVAILABLE" };
    }
    if (outcome === "REJECT") {
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
        ...requestContext,
        abuseNetworkSignal: networkSignal,
      },
    );
    return accepted;
  } catch (error) {
    if (!(error instanceof ApplicationError)) {
      reportUnexpectedError(error, {
        correlationId,
        operation: "lead.public-create",
      });
    }
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
