import { describe, expect, it, vi } from "vitest";

import { softDeletePropertyMedia } from "@/application/property-media/delete-property-media";
import type {
  MediaCommandContext,
  MediaRecord,
} from "@/application/property-media/media-contracts";
import type {
  MediaTransaction,
  MediaUnitOfWork,
} from "@/application/property-media/media-ports";
import { reorderPropertyMedia } from "@/application/property-media/reorder-property-media";

const propertyId = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const identityId = "44444444-4444-4444-8444-444444444444";

function context(role: "ADMIN" | "ADVISOR" = "ADMIN"): MediaCommandContext {
  return {
    actor: {
      authUserId: "55555555-5555-4555-8555-555555555555",
      identityId,
      role,
      aal: role === "ADMIN" ? "aal2" : "aal1",
    },
    correlationId: "66666666-6666-4666-8666-666666666666",
    requestId: "request",
    idempotencyKey: "77777777-7777-4777-8777-777777777777",
  };
}

function media(id: string, order: number, cover: boolean): MediaRecord {
  return {
    id,
    propertyId,
    state: "READY",
    visibility: "PRIVATE",
    sourceVersion: 1,
    sortOrder: order,
    isCover: cover,
    version: 1n,
    deletedAt: null,
    failureRetryable: null,
  };
}

function fixture(role: "ADMIN" | "ADVISOR" = "ADMIN", assigned = true) {
  const rows = [media(first, 1, true), media(second, 2, false)];
  const tx = {
    loadAuthorizationFacts: vi.fn().mockResolvedValue({
      active: true,
      role,
      aal: role === "ADMIN" ? "aal2" : "aal1",
      permissions: new Set(),
      advisorId:
        role === "ADVISOR" ? "88888888-8888-4888-8888-888888888888" : null,
    }),
    isAdvisorAssigned: vi.fn().mockResolvedValue(assigned),
    propertyIsCommandable: vi.fn().mockResolvedValue(true),
    getPropertyVersion: vi.fn().mockResolvedValue(5n),
    listActiveMedia: vi.fn().mockResolvedValue(rows),
    getMedia: vi
      .fn()
      .mockImplementation(
        async (id: string) => rows.find((row) => row.id === id) ?? null,
      ),
    applyOrdering: vi.fn().mockResolvedValue(undefined),
    softDeleteMedia: vi.fn().mockResolvedValue(undefined),
    restoreMedia: vi.fn(),
    retryMedia: vi.fn(),
    bumpPropertyVersion: vi.fn().mockResolvedValue(true),
    insertAuditLog: vi.fn(),
    insertOutboxMessage: vi.fn(),
    getMediaByUploadSession: vi.fn(),
    getUploadSession: vi.fn(),
    findUploadSessionByIdempotencyKey: vi.fn(),
    insertUploadSession: vi.fn(),
    finalizeUpload: vi.fn(),
  } as unknown as MediaTransaction;
  const uow = {
    transaction: <T>(work: (transaction: MediaTransaction) => Promise<T>) =>
      work(tx),
    recordDeniedCommand: vi.fn(),
  } satisfies MediaUnitOfWork;
  return { tx, uow };
}

describe("media ordering and lifecycle commands", () => {
  it("applies a complete dense ordering with exactly one cover and bumps property version", async () => {
    const { tx, uow } = fixture();
    await expect(
      reorderPropertyMedia(uow, context(), {
        propertyId,
        expectedPropertyVersion: 5n,
        items: [
          { mediaId: second, sortOrder: 1, isCover: true },
          { mediaId: first, sortOrder: 2, isCover: false },
        ],
      }),
    ).resolves.toEqual({ propertyVersion: 6n });
    expect(tx.applyOrdering).toHaveBeenCalledOnce();
    expect(tx.bumpPropertyVersion).toHaveBeenCalledWith(propertyId, 5n);
  });

  it("rejects stale and partial reorder commands before mutation", async () => {
    const { tx, uow } = fixture();
    await expect(
      reorderPropertyMedia(uow, context(), {
        propertyId,
        expectedPropertyVersion: 4n,
        items: [],
      }),
    ).rejects.toThrow("MEDIA_CONFLICT");
    await expect(
      reorderPropertyMedia(uow, context(), {
        propertyId,
        expectedPropertyVersion: 5n,
        items: [{ mediaId: first, sortOrder: 1, isCover: true }],
      }),
    ).rejects.toThrow("MEDIA_CONFLICT");
    expect(tx.applyOrdering).not.toHaveBeenCalled();
  });

  it("denies advisor deletion even inside assigned scope", async () => {
    const { tx, uow } = fixture("ADVISOR", true);
    await expect(
      softDeletePropertyMedia(uow, context("ADVISOR"), {
        propertyId,
        mediaId: first,
        expectedMediaVersion: 1n,
        expectedPropertyVersion: 5n,
        reasonCode: "ADMIN_REQUEST",
      }),
    ).rejects.toThrow("MEDIA_FORBIDDEN");
    expect(tx.softDeleteMedia).not.toHaveBeenCalled();
    expect(uow.recordDeniedCommand).toHaveBeenCalledWith(
      expect.anything(),
      propertyId,
      "property_media.delete",
      "MEDIA_FORBIDDEN",
    );
  });

  it("soft deletes atomically and promotes the remaining item to cover", async () => {
    const { tx, uow } = fixture();
    await softDeletePropertyMedia(uow, context(), {
      propertyId,
      mediaId: first,
      expectedMediaVersion: 1n,
      expectedPropertyVersion: 5n,
      reasonCode: "ADMIN_REQUEST",
    });
    expect(tx.softDeleteMedia).toHaveBeenCalledOnce();
    expect(tx.applyOrdering).toHaveBeenCalledWith(propertyId, [
      { mediaId: second, sortOrder: 1, isCover: true },
    ]);
    expect(tx.insertOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "property_media.delivery_revoke_requested",
      }),
    );
  });
});
