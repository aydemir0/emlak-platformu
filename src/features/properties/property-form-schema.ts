import { z } from "zod";

const emptyToNull = (value: unknown) =>
  value === "" || value === undefined ? null : value;
const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).nullable(),
);
const optionalNumber = z.preprocess(
  emptyToNull,
  z.coerce.number().finite().nonnegative().nullable(),
);
const optionalInteger = z.preprocess(
  emptyToNull,
  z.coerce.number().int().nonnegative().nullable(),
);

const propertyFormSchema = z
  .object({
    listingTypeId: z.uuid(),
    propertyTypeId: z.uuid(),
    locationId: z.uuid(),
    heatingTypeId: z.preprocess(emptyToNull, z.uuid().nullable()),
    title: z.string().trim().min(1).max(200),
    description: optionalText,
    shortDescription: optionalText,
    grossAreaSqm: optionalNumber,
    netAreaSqm: optionalNumber,
    livingRoomCount: optionalInteger,
    bedroomCount: optionalInteger,
    bathroomCount: optionalInteger,
    buildingAgeYears: optionalInteger,
    floorNumber: z.preprocess(emptyToNull, z.coerce.number().int().nullable()),
    totalFloorCount: optionalInteger,
    furnished: z.preprocess(
      emptyToNull,
      z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .nullable(),
    ),
    addressLine: optionalText,
    latitude: z.preprocess(
      emptyToNull,
      z.coerce.number().min(-90).max(90).nullable(),
    ),
    longitude: z.preprocess(
      emptyToNull,
      z.coerce.number().min(-180).max(180).nullable(),
    ),
    locationVisibility: z.preprocess(emptyToNull, z.null()),
    priceAmountMinor: z.preprocess(
      emptyToNull,
      z.coerce.bigint().nonnegative().nullable(),
    ),
    currencyCode: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
    ),
  })
  .superRefine((value, context) => {
    if ((value.latitude === null) !== (value.longitude === null)) {
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Coordinates must be supplied together",
      });
    }
    if (
      value.netAreaSqm !== null &&
      value.grossAreaSqm !== null &&
      value.netAreaSqm > value.grossAreaSqm
    ) {
      context.addIssue({
        code: "custom",
        path: ["netAreaSqm"],
        message: "Net area cannot exceed gross area",
      });
    }
    if ((value.priceAmountMinor === null) !== (value.currencyCode === null)) {
      context.addIssue({
        code: "custom",
        path: ["priceAmountMinor"],
        message: "Price and currency must be supplied together",
      });
    }
  });

export type ParsedPropertyForm = z.infer<typeof propertyFormSchema>;

export function parsePropertyForm(
  input: Record<string, unknown>,
): ParsedPropertyForm {
  return propertyFormSchema.parse(input);
}

export function formDataToRecord(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}
