import { z } from "zod";

const optionalText = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(4_000).optional(),
);

const formSchema = z
  .object({
    propertyId: z.string().trim().min(1).max(128),
    email: optionalText,
    phone: optionalText,
    name: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).max(160).optional(),
    ),
    message: optionalText,
    consentAccepted: z.literal("on"),
    idempotencyKey: z.uuid(),
    challengeToken: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().min(1).max(4_096).optional(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.email === undefined && value.phone === undefined) {
      context.addIssue({ code: "custom", message: "LEAD_VALIDATION_FAILED" });
    }
  });

export type PublicLeadForm = z.infer<typeof formSchema>;

export function parsePublicLeadForm(
  values: Record<string, unknown>,
): PublicLeadForm {
  try {
    return formSchema.parse(values);
  } catch {
    throw new Error("LEAD_VALIDATION_FAILED");
  }
}

export function publicLeadAnalyticsPayload(
  input: Readonly<{
    source: "property_detail";
    duplicateCandidateDetected: boolean;
  }>,
) {
  return {
    source: input.source,
    duplicateCandidateDetected: input.duplicateCandidateDetected,
  } as const;
}
