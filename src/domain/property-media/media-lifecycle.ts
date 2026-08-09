import type { MediaState } from "@/domain/property-media/media";

const ALLOWED_TRANSITIONS: Readonly<Record<MediaState, readonly MediaState[]>> =
  {
    UPLOADED: ["PROCESSING", "DELETED"],
    PROCESSING: ["READY", "FAILED", "DELETED"],
    READY: ["PROCESSING", "DELETED"],
    FAILED: ["PROCESSING", "DELETED"],
    DELETED: ["UPLOADED"],
  };

export function assertMediaTransition(from: MediaState, to: MediaState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error("MEDIA_INVALID_TRANSITION");
  }
}
