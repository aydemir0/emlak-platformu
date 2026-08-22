export const LEAD_STATES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export const LEAD_STATE_TRANSITIONS: Readonly<
  Record<LeadState, readonly LeadState[]>
> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["VIEWING", "LOST"],
  VIEWING: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["LOST"],
  WON: [],
  LOST: [],
};

export function assertLeadTransition(
  from: LeadState | string,
  to: LeadState | string,
): asserts to is LeadState {
  if (!LEAD_STATE_TRANSITIONS[from as LeadState]?.includes(to as LeadState)) {
    throw new Error("LEAD_INVALID_TRANSITION");
  }
}
