import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_STATE_TRANSITIONS,
  assertAppointmentVersion,
  assertAppointmentTransition,
  isAppointmentTimeBlockingState,
} from "@/domain/appointments/appointment-lifecycle";

describe("appointment lifecycle", () => {
  it("allows every locked lifecycle transition", () => {
    expect(APPOINTMENT_STATE_TRANSITIONS.REQUESTED).toEqual([
      "CONFIRMED",
      "CANCELLED",
    ]);
    expect(() =>
      assertAppointmentTransition("REQUESTED", "CONFIRMED"),
    ).not.toThrow();
    expect(() =>
      assertAppointmentTransition("REQUESTED", "CANCELLED"),
    ).not.toThrow();
    expect(() =>
      assertAppointmentTransition("CONFIRMED", "COMPLETED"),
    ).not.toThrow();
    expect(() =>
      assertAppointmentTransition("CONFIRMED", "CANCELLED"),
    ).not.toThrow();
    expect(() =>
      assertAppointmentTransition("CONFIRMED", "NO_SHOW"),
    ).not.toThrow();
  });

  it("rejects skipped, reopening, and terminal-state transitions", () => {
    expect(() => assertAppointmentTransition("REQUESTED", "COMPLETED")).toThrow(
      "APPOINTMENT_INVALID_TRANSITION",
    );
    expect(() => assertAppointmentTransition("COMPLETED", "REQUESTED")).toThrow(
      "APPOINTMENT_INVALID_TRANSITION",
    );
    expect(() => assertAppointmentTransition("CANCELLED", "CONFIRMED")).toThrow(
      "APPOINTMENT_INVALID_TRANSITION",
    );
    expect(() => assertAppointmentTransition("NO_SHOW", "CONFIRMED")).toThrow(
      "APPOINTMENT_INVALID_TRANSITION",
    );
  });

  it("reserves an advisor slot only while requested or confirmed", () => {
    expect(isAppointmentTimeBlockingState("REQUESTED")).toBe(true);
    expect(isAppointmentTimeBlockingState("CONFIRMED")).toBe(true);
    expect(isAppointmentTimeBlockingState("COMPLETED")).toBe(false);
    expect(isAppointmentTimeBlockingState("CANCELLED")).toBe(false);
    expect(isAppointmentTimeBlockingState("NO_SHOW")).toBe(false);
  });

  it("rejects stale or invalid optimistic versions", () => {
    expect(() => assertAppointmentVersion(7n, 7n)).not.toThrow();
    expect(() => assertAppointmentVersion(7n, 6n)).toThrow(
      "APPOINTMENT_VERSION_CONFLICT",
    );
    expect(() => assertAppointmentVersion(7n, 0n)).toThrow(
      "APPOINTMENT_INVALID_VERSION",
    );
  });
});
