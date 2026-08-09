import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { finalizeMediaUpload } from "@/application/property-media/finalize-media-upload";
import { initializeMediaUpload } from "@/application/property-media/initialize-media-upload";
import type {
  MediaCommandContext,
  MediaRecord,
  UploadSessionRecord,
} from "@/application/property-media/media-contracts";
import type {
  MediaTransaction,
  MediaUnitOfWork,
} from "@/application/property-media/media-ports";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-08-09T12:00:00Z");

const context: MediaCommandContext = {
  actor: {
    authUserId: "55555555-5555-4555-8555-555555555555",
    identityId: ACTOR_ID,
    role: "ADMIN",
    aal: "aal2",
  },
  correlationId: "66666666-6666-4666-8666-666666666666",
  requestId: "request-1",
  idempotencyKey: "77777777-7777-4777-8777-777777777777",
};

class FakeMediaUow implements MediaUnitOfWork, MediaTransaction {
  session: UploadSessionRecord | null = null;
  media: MediaRecord | null = null;
  assigned = true;
  commandable = true;
  denied = vi.fn();
  audits: Record<string, unknown>[] = [];
  outbox: Record<string, unknown>[] = [];

  async transaction<T>(work: (tx: MediaTransaction) => Promise<T>) {
    return work(this);
  }
  async recordDeniedCommand(
    ...args: Parameters<MediaUnitOfWork["recordDeniedCommand"]>
  ) {
    this.denied(...args);
  }
  async loadAuthorizationFacts(commandContext: MediaCommandContext) {
    return {
      active: true,
      role: commandContext.actor.role,
      aal: commandContext.actor.aal,
      permissions: new Set<string>(),
      advisorId:
        commandContext.actor.role === "ADVISOR"
          ? "88888888-8888-4888-8888-888888888888"
          : null,
    };
  }
  async isAdvisorAssigned() {
    return this.assigned;
  }
  async propertyIsCommandable() {
    return this.commandable;
  }
  async findUploadSessionByIdempotencyKey(idempotencyKey: string) {
    return this.session?.idempotencyKey === idempotencyKey
      ? this.session
      : null;
  }
  async getUploadSession(sessionId: string) {
    return this.session?.id === sessionId ? this.session : null;
  }
  async insertUploadSession(session: UploadSessionRecord) {
    this.session = session;
  }
  async getMediaByUploadSession() {
    return this.media;
  }
  async getMedia() {
    return this.media;
  }
  async getPropertyVersion() {
    return 1n;
  }
  async listActiveMedia() {
    return this.media ? [this.media] : [];
  }
  async applyOrdering() {}
  async softDeleteMedia() {}
  async restoreMedia() {}
  async retryMedia() {
    return true;
  }
  async bumpPropertyVersion() {
    return true;
  }
  async finalizeUpload(
    input: Parameters<MediaTransaction["finalizeUpload"]>[0],
  ) {
    this.session = { ...input.session, status: "FINALIZED" };
    this.media = {
      id: input.session.plannedMediaId,
      propertyId: input.session.propertyId,
      state: "UPLOADED",
      visibility: "PRIVATE",
      sourceVersion: 1,
      sortOrder: 1,
      isCover: true,
      version: 1n,
      deletedAt: null,
      failureRetryable: null,
    };
    return this.media;
  }
  async insertAuditLog(values: Record<string, unknown>) {
    this.audits.push(values);
  }
  async insertOutboxMessage(values: Record<string, unknown>) {
    this.outbox.push(values);
  }
}

describe("media upload use cases", () => {
  let uow: FakeMediaUow;
  let storage: DeterministicMediaStorage;
  beforeEach(() => {
    uow = new FakeMediaUow();
    storage = new DeterministicMediaStorage(NOW);
  });

  it("initializes an exact 5-minute grant with server-generated controlled identity", async () => {
    const result = await initializeMediaUpload(
      uow,
      storage,
      context,
      { propertyId: PROPERTY_ID, declaredMimeType: "image/jpeg", byteSize: 3 },
      {
        now: () => NOW,
        uuid: vi
          .fn()
          .mockReturnValueOnce(MEDIA_ID)
          .mockReturnValueOnce(SESSION_ID),
      },
    );
    expect(result.session.objectKey).toBe(
      `private/quarantine/properties/${PROPERTY_ID}/${MEDIA_ID}/1/source`,
    );
    expect(result.grant.expiresAt).toEqual(new Date(NOW.getTime() + 300_000));
    expect(result.grant.headers).toEqual({
      "content-type": "image/jpeg",
      "if-none-match": "*",
    });
  });

  it("replays the same idempotent request and rejects a conflicting replay", async () => {
    const input = {
      propertyId: PROPERTY_ID,
      declaredMimeType: "image/jpeg",
      byteSize: 3,
    } as const;
    await initializeMediaUpload(uow, storage, context, input, {
      now: () => NOW,
      uuid: vi
        .fn()
        .mockReturnValueOnce(MEDIA_ID)
        .mockReturnValueOnce(SESSION_ID),
    });
    const replay = await initializeMediaUpload(uow, storage, context, input, {
      now: () => NOW,
    });
    expect(replay.session.id).toBe(SESSION_ID);
    await expect(
      initializeMediaUpload(
        uow,
        storage,
        context,
        { ...input, byteSize: 4 },
        { now: () => NOW },
      ),
    ).rejects.toThrow("MEDIA_CONFLICT");
  });

  it("binds upload-session replay and finalization to the initiating identity", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const initialized = await initializeMediaUpload(
      uow,
      storage,
      context,
      { propertyId: PROPERTY_ID, declaredMimeType: "image/jpeg", byteSize: 3 },
      {
        now: () => NOW,
        uuid: vi
          .fn()
          .mockReturnValueOnce(MEDIA_ID)
          .mockReturnValueOnce(SESSION_ID),
      },
    );
    const otherContext = {
      ...context,
      actor: {
        ...context.actor,
        identityId: "99999999-9999-4999-8999-999999999999",
      },
    };
    await expect(
      initializeMediaUpload(
        uow,
        storage,
        otherContext,
        {
          propertyId: PROPERTY_ID,
          declaredMimeType: "image/jpeg",
          byteSize: 3,
        },
        { now: () => NOW },
      ),
    ).rejects.toThrow("MEDIA_CONFLICT");
    await storage.put({
      key: initialized.session.objectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    await expect(
      finalizeMediaUpload(
        uow,
        storage,
        otherContext,
        { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
        () => NOW,
      ),
    ).rejects.toThrow("MEDIA_NOT_FOUND");
  });

  it("records safe denial evidence when upload finalization is forbidden", async () => {
    uow.assigned = false;
    await expect(
      finalizeMediaUpload(
        uow,
        storage,
        {
          ...context,
          actor: { ...context.actor, role: "ADVISOR", aal: "aal1" },
        },
        { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
        () => NOW,
      ),
    ).rejects.toThrow("MEDIA_FORBIDDEN");
    expect(uow.denied).toHaveBeenCalledWith(
      expect.anything(),
      PROPERTY_ID,
      "property_media.upload_finalize",
      "MEDIA_FORBIDDEN",
    );
  });

  it("denies a cross-property advisor and records safe denial evidence", async () => {
    uow.assigned = false;
    const advisorContext = {
      ...context,
      actor: {
        ...context.actor,
        role: "ADVISOR" as const,
        aal: "aal1" as const,
      },
    };
    await expect(
      initializeMediaUpload(uow, storage, advisorContext, {
        propertyId: PROPERTY_ID,
        declaredMimeType: "image/jpeg",
        byteSize: 3,
      }),
    ).rejects.toThrow("MEDIA_FORBIDDEN");
    expect(uow.denied).toHaveBeenCalledOnce();
  });

  it("finalizes only matching observed bytes and returns exact replay", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const initialized = await initializeMediaUpload(
      uow,
      storage,
      context,
      {
        propertyId: PROPERTY_ID,
        declaredMimeType: "image/jpeg",
        byteSize: bytes.byteLength,
        checksumSha256: checksum,
      },
      {
        now: () => NOW,
        uuid: vi
          .fn()
          .mockReturnValueOnce(MEDIA_ID)
          .mockReturnValueOnce(SESSION_ID),
      },
    );
    await storage.put({
      key: initialized.session.objectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: checksum,
      ifAbsent: true,
    });
    const first = await finalizeMediaUpload(
      uow,
      storage,
      context,
      { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
      () => NOW,
    );
    const replay = await finalizeMediaUpload(
      uow,
      storage,
      context,
      { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
      () => NOW,
    );
    expect(first).toMatchObject({
      id: MEDIA_ID,
      state: "UPLOADED",
      isCover: true,
    });
    expect(replay).toEqual(first);
  });

  it("rejects upload expiry and observed byte mismatch", async () => {
    const initialized = await initializeMediaUpload(
      uow,
      storage,
      context,
      { propertyId: PROPERTY_ID, declaredMimeType: "image/jpeg", byteSize: 3 },
      {
        now: () => NOW,
        uuid: vi
          .fn()
          .mockReturnValueOnce(MEDIA_ID)
          .mockReturnValueOnce(SESSION_ID),
      },
    );
    const bytes = new Uint8Array([1, 2]);
    await storage.put({
      key: initialized.session.objectKey,
      bytes,
      contentType: "image/jpeg",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    await expect(
      finalizeMediaUpload(
        uow,
        storage,
        context,
        { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
        () => NOW,
      ),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
    await expect(
      finalizeMediaUpload(
        uow,
        storage,
        context,
        { propertyId: PROPERTY_ID, sessionId: SESSION_ID },
        () => new Date(NOW.getTime() + 301_000),
      ),
    ).rejects.toThrow("MEDIA_UPLOAD_EXPIRED");
  });
});
