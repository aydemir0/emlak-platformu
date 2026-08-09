import type { PropertyAuthorizationFacts } from "@/application/properties/authorize-property-command";
import type {
  MediaCommandContext,
  MediaRecord,
  UploadSessionRecord,
} from "@/application/property-media/media-contracts";

export interface MediaTransaction {
  loadAuthorizationFacts(
    context: MediaCommandContext,
  ): Promise<PropertyAuthorizationFacts>;
  isAdvisorAssigned(propertyId: string, advisorId: string): Promise<boolean>;
  propertyIsCommandable(
    propertyId: string,
    options: { lock: boolean },
  ): Promise<boolean>;
  findUploadSessionByIdempotencyKey(
    idempotencyKey: string,
    options: { lock: boolean },
  ): Promise<UploadSessionRecord | null>;
  getUploadSession(
    sessionId: string,
    options: { lock: boolean },
  ): Promise<UploadSessionRecord | null>;
  insertUploadSession(session: UploadSessionRecord): Promise<void>;
  getMediaByUploadSession(sessionId: string): Promise<MediaRecord | null>;
  getMedia(
    mediaId: string,
    options: { lock: boolean },
  ): Promise<MediaRecord | null>;
  getPropertyVersion(
    propertyId: string,
    options: { lock: boolean },
  ): Promise<bigint | null>;
  listActiveMedia(
    propertyId: string,
    options: { lock: boolean },
  ): Promise<MediaRecord[]>;
  applyOrdering(
    propertyId: string,
    items: readonly { mediaId: string; sortOrder: number; isCover: boolean }[],
  ): Promise<void>;
  softDeleteMedia(
    input: Readonly<{
      mediaId: string;
      actorIdentityId: string;
      reasonCode: string;
      now: Date;
    }>,
  ): Promise<void>;
  restoreMedia(input: Readonly<{ mediaId: string; now: Date }>): Promise<void>;
  retryMedia(
    input: Readonly<{ mediaId: string; expectedVersion: bigint; now: Date }>,
  ): Promise<boolean>;
  bumpPropertyVersion(
    propertyId: string,
    expectedVersion: bigint,
  ): Promise<boolean>;
  finalizeUpload(
    input: Readonly<{
      session: UploadSessionRecord;
      actorIdentityId: string;
      observedByteSize: number;
      observedChecksumSha256: string;
      observedEtag: string;
      observedAt: Date;
      correlationId: string;
      requestId: string;
    }>,
  ): Promise<MediaRecord>;
  insertAuditLog(values: Record<string, unknown>): Promise<void>;
  insertOutboxMessage(values: Record<string, unknown>): Promise<void>;
}

export interface MediaUnitOfWork {
  transaction<T>(work: (tx: MediaTransaction) => Promise<T>): Promise<T>;
  recordDeniedCommand(
    context: MediaCommandContext,
    propertyId: string,
    action: string,
    reasonCode: string,
  ): Promise<void>;
}
