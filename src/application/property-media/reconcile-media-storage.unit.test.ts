import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { MediaWorkerRepository } from "@/application/property-media/media-worker-ports";
import { reconcileMediaStorage } from "@/application/property-media/reconcile-media-storage";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";

const propertyId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const prefix = "delivery/properties/";
const key = `${prefix}${propertyId}/${mediaId}/1/property-v1/640.webp`;

function repository(authoritative: boolean): MediaWorkerRepository {
  return {
    claimNext: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    findAuthoritativeObjectKeys: vi
      .fn()
      .mockImplementation(
        async (keys: readonly string[]) => new Set(authoritative ? keys : []),
      ),
  };
}

describe("media storage reconciliation", () => {
  it("deletes only aged controlled orphan objects and is idempotent", async () => {
    const storedAt = new Date("2026-08-09T10:00:00Z");
    const storage = new DeterministicMediaStorage(storedAt);
    const bytes = new Uint8Array([1]);
    await storage.put({
      key,
      bytes,
      contentType: "image/webp",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    const repo = repository(false);
    await expect(
      reconcileMediaStorage(repo, storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T12:00:00Z"),
        graceSeconds: 3600,
      }),
    ).resolves.toEqual({ inspected: 1, deleted: 1 });
    await expect(
      reconcileMediaStorage(repo, storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T12:00:00Z"),
        graceSeconds: 3600,
      }),
    ).resolves.toEqual({ inspected: 0, deleted: 0 });
  });

  it("retains authoritative and grace-period objects", async () => {
    const storage = new DeterministicMediaStorage(
      new Date("2026-08-09T11:59:30Z"),
    );
    const bytes = new Uint8Array([1]);
    await storage.put({
      key,
      bytes,
      contentType: "image/webp",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    await expect(
      reconcileMediaStorage(repository(false), storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T12:00:00Z"),
        graceSeconds: 60,
      }),
    ).resolves.toMatchObject({ deleted: 0 });
    await expect(
      reconcileMediaStorage(repository(true), storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T13:00:00Z"),
        graceSeconds: 60,
      }),
    ).resolves.toMatchObject({ deleted: 0 });
  });

  it("refuses arbitrary prefixes and unbounded batches", async () => {
    const storage = new DeterministicMediaStorage();
    await expect(
      reconcileMediaStorage(repository(false), storage, {
        prefix: "private/",
        limit: 10,
        now: new Date(),
        graceSeconds: 1,
      }),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
    await expect(
      reconcileMediaStorage(repository(false), storage, {
        prefix,
        limit: 251,
        now: new Date(),
        graceSeconds: 1,
      }),
    ).rejects.toThrow("MEDIA_VALIDATION_FAILED");
  });

  it("emits a PII-free bounded reconciliation run summary", async () => {
    const reportRun = vi.fn();
    const storage = new DeterministicMediaStorage();

    await reconcileMediaStorage(repository(false), storage, {
      prefix,
      limit: 10,
      now: new Date("2026-08-09T12:00:00Z"),
      graceSeconds: 60,
      correlationId: "media-reconcile-run-1",
      reportRun,
    });

    expect(reportRun).toHaveBeenCalledWith({
      operation: "media.reconcile",
      correlationId: "media-reconcile-run-1",
      claimed: 0,
      succeeded: 0,
      retried: 0,
      deadLettered: 0,
      staleRecovered: 0,
      durationMs: expect.any(Number),
      failureCategories: {
        application: 0,
        dependency: 0,
        storage: 0,
        validation: 0,
      },
    });
    expect(JSON.stringify(reportRun.mock.calls)).not.toMatch(
      /properties\/.+\/.+\//,
    );
  });

  it("retains listed progress and classifies a database lookup failure", async () => {
    const storage = new DeterministicMediaStorage(
      new Date("2026-08-09T10:00:00Z"),
    );
    const bytes = new Uint8Array([1]);
    await storage.put({
      key,
      bytes,
      contentType: "image/webp",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    const repo = repository(false);
    const lookupError = new Error("database unavailable");
    vi.mocked(repo.findAuthoritativeObjectKeys).mockRejectedValueOnce(
      lookupError,
    );
    const reporter = vi.fn();

    await expect(
      reconcileMediaStorage(repo, storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T12:00:00Z"),
        graceSeconds: 60,
        correlationId: "media-reconcile-db-failure",
        reportRun: reporter,
      }),
    ).rejects.toBe(lookupError);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: 1,
        succeeded: 0,
        failureCategories: {
          application: 0,
          dependency: 1,
          storage: 0,
          validation: 0,
        },
      }),
    );
  });

  it("retains listed progress and classifies a storage deletion failure", async () => {
    const storage = new DeterministicMediaStorage(
      new Date("2026-08-09T10:00:00Z"),
    );
    const bytes = new Uint8Array([1]);
    await storage.put({
      key,
      bytes,
      contentType: "image/webp",
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      ifAbsent: true,
    });
    const deletionError = new Error("storage unavailable");
    vi.spyOn(storage, "delete").mockRejectedValueOnce(deletionError);
    const reporter = vi.fn();

    await expect(
      reconcileMediaStorage(repository(false), storage, {
        prefix,
        limit: 10,
        now: new Date("2026-08-09T12:00:00Z"),
        graceSeconds: 60,
        correlationId: "media-reconcile-storage-failure",
        reportRun: reporter,
      }),
    ).rejects.toBe(deletionError);
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: 1,
        succeeded: 0,
        failureCategories: {
          application: 0,
          dependency: 0,
          storage: 1,
          validation: 0,
        },
      }),
    );
  });
});
