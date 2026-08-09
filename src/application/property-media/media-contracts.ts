import type { StaffPrincipal } from "@/application/auth/staff-principal";

export type MediaCommandContext = Readonly<{
  actor: StaffPrincipal;
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
}>;

export type UploadSessionRecord = Readonly<{
  id: string;
  propertyId: string;
  plannedMediaId: string;
  initiatedByIdentityId: string;
  objectKey: string;
  idempotencyKey: string;
  expectedMimeType: string;
  expectedChecksumSha256: string | null;
  maximumBytes: number;
  status: "REQUESTED" | "UPLOADING" | "FINALIZED" | "EXPIRED" | "ABORTED";
  expiresAt: Date;
  version: bigint;
}>;

export type MediaRecord = Readonly<{
  id: string;
  propertyId: string;
  state: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
  visibility: "PRIVATE" | "PUBLIC";
  sourceVersion: number;
  sortOrder: number;
  isCover: boolean;
  version: bigint;
  deletedAt: Date | null;
  failureRetryable: boolean | null;
}>;

export type InitializeMediaUploadInput = Readonly<{
  propertyId: string;
  declaredMimeType: string;
  byteSize: number;
  checksumSha256?: string;
}>;

export type FinalizeMediaUploadInput = Readonly<{
  propertyId: string;
  sessionId: string;
}>;
