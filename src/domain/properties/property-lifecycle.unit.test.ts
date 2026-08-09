import { describe, expect, it } from "vitest";

import {
  PROPERTY_STATE_TRANSITIONS,
  assertPropertyTransition,
} from "@/domain/properties/property-lifecycle";

describe("property lifecycle", () => {
  it("accepts every approved transition", () => {
    for (const [from, destinations] of Object.entries(
      PROPERTY_STATE_TRANSITIONS,
    )) {
      for (const to of destinations) {
        expect(() => assertPropertyTransition(from, to)).not.toThrow();
      }
    }
  });

  it("rejects self transitions and unlisted transitions", () => {
    expect(() => assertPropertyTransition("DRAFT", "DRAFT")).toThrow(
      "PROPERTY_INVALID_TRANSITION",
    );
    expect(() => assertPropertyTransition("DRAFT", "ACTIVE")).toThrow(
      "PROPERTY_INVALID_TRANSITION",
    );
    expect(() => assertPropertyTransition("SOLD", "ACTIVE")).toThrow(
      "PROPERTY_INVALID_TRANSITION",
    );
  });
});
