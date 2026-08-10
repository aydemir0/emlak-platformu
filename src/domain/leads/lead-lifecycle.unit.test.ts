import { describe, expect, it } from "vitest";

import {
  assertLeadTransition,
  LEAD_STATE_TRANSITIONS,
} from "@/domain/leads/lead-lifecycle";

describe("lead lifecycle", () => {
  it("allows the locked commercial progression", () => {
    expect(LEAD_STATE_TRANSITIONS.NEW).toEqual(["CONTACTED", "LOST"]);
    expect(() => assertLeadTransition("NEW", "CONTACTED")).not.toThrow();
    expect(() => assertLeadTransition("NEGOTIATION", "WON")).not.toThrow();
  });

  it("allows every non-terminal state to move to LOST", () => {
    for (const state of [
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "VIEWING",
      "NEGOTIATION",
    ]) {
      expect(() => assertLeadTransition(state, "LOST")).not.toThrow();
    }
  });

  it("rejects terminal-state and skipped transitions", () => {
    expect(() => assertLeadTransition("WON", "LOST")).toThrow(
      "LEAD_INVALID_TRANSITION",
    );
    expect(() => assertLeadTransition("LOST", "CONTACTED")).toThrow(
      "LEAD_INVALID_TRANSITION",
    );
    expect(() => assertLeadTransition("NEW", "QUALIFIED")).toThrow(
      "LEAD_INVALID_TRANSITION",
    );
  });
});
