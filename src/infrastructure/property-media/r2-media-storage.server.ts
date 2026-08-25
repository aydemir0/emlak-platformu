import "server-only";

import { createHash } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  MediaStorage,
  StoredObjectMetadata,
} from "@/application/property-media/media-storage";
import { getR2Addressing } from "@/config/r2-addressing";

type S3Sender = Readonly<{
  send(command: unknown): Promise<Record<string, unknown>>;
}>;

type Presigner = (
  client: unknown,
  command: PutObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

type R2Config = Readonly<{
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}>;

type R2Dependencies = Readonly<{
  client?: S3Sender;
  signer?: Presigner;
  now?: () => Date;
}>;

const ALLOWED_PREFIXES = [
  "private/quarantine/",
  "private/originals/",
  "delivery/properties/",
] as const;

function assertControlledKey(value: string): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("..") ||
    value.includes("\\") ||
    !ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix))
  ) {
    throw new Error("MEDIA_VALIDATION_FAILED");
  }
}

function assertConfig(config: R2Config): void {
  if (Object.values(config).some((value) => !value.trim())) {
    throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  }
}

export function createR2S3Client(config: R2Config): S3Client {
  assertConfig(config);
  const addressing = getR2Addressing({
    accountId: config.accountId,
    bucketName: config.bucket,
  });
  if (!addressing) throw new Error("MEDIA_STORAGE_UNAVAILABLE");

  return new S3Client({
    region: "auto",
    endpoint: addressing.endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class R2MediaStorage implements MediaStorage {
  private readonly client: S3Sender;
  private readonly signingClient: unknown;
  private readonly signer: Presigner;
  private readonly now: () => Date;

  constructor(
    private readonly config: R2Config,
    dependencies: R2Dependencies = {},
  ) {
    const actualClient = createR2S3Client(config);
    this.client = dependencies.client ?? (actualClient as unknown as S3Sender);
    this.signingClient = dependencies.client ?? actualClient;
    this.signer = dependencies.signer ?? (getSignedUrl as Presigner);
    this.now = dependencies.now ?? (() => new Date());
  }

  async presignPut(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
    maximumBytes: number;
  }) {
    assertControlledKey(input.key);
    if (
      input.maximumBytes <= 0 ||
      input.expiresInSeconds <= 0 ||
      input.expiresInSeconds > 604_800 ||
      !input.contentType.startsWith("image/")
    ) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maximumBytes,
      IfNoneMatch: "*",
    });
    const url = await this.signer(this.signingClient, command, {
      expiresIn: input.expiresInSeconds,
    });
    return {
      method: "PUT" as const,
      url,
      headers: {
        "content-type": input.contentType,
        "if-none-match": "*",
      },
      expiresAt: new Date(
        this.now().getTime() + input.expiresInSeconds * 1_000,
      ),
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    assertControlledKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const metadata = result.Metadata as Record<string, string> | undefined;
      return {
        key,
        size: Number(result.ContentLength ?? 0),
        etag: text(result.ETag) ?? "",
        ...(metadata?.sha256 ? { checksumSha256: metadata.sha256 } : {}),
        contentType: text(result.ContentType) ?? "application/octet-stream",
        uploadedAt:
          result.LastModified instanceof Date
            ? result.LastModified
            : this.now(),
      };
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async get(key: string, maximumBytes: number) {
    assertControlledKey(key);
    if (maximumBytes <= 0) throw new Error("MEDIA_VALIDATION_FAILED");
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (Number(result.ContentLength ?? 0) > maximumBytes) {
        throw new Error("MEDIA_VALIDATION_FAILED");
      }
      const body = result.Body as
        { transformToByteArray(): Promise<Uint8Array> } | undefined;
      if (!body) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
      const bytes = await body.transformToByteArray();
      if (bytes.byteLength > maximumBytes) {
        throw new Error("MEDIA_VALIDATION_FAILED");
      }
      const digest = checksum(bytes);
      return {
        bytes,
        metadata: {
          key,
          size: bytes.byteLength,
          etag: text(result.ETag) ?? "",
          checksumSha256: digest,
          contentType: text(result.ContentType) ?? "application/octet-stream",
          uploadedAt:
            result.LastModified instanceof Date
              ? result.LastModified
              : this.now(),
        },
      };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    checksumSha256: string;
    cacheControl?: string;
    ifAbsent: boolean;
  }): Promise<StoredObjectMetadata> {
    assertControlledKey(input.key);
    if (
      !input.bytes.byteLength ||
      checksum(input.bytes) !== input.checksumSha256
    ) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentLength: input.bytes.byteLength,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        Metadata: { sha256: input.checksumSha256 },
        ...(input.ifAbsent ? { IfNoneMatch: "*" } : {}),
      }),
    );
    return {
      key: input.key,
      size: input.bytes.byteLength,
      etag: text(result.ETag) ?? "",
      checksumSha256: input.checksumSha256,
      contentType: input.contentType,
      uploadedAt: this.now(),
    };
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    if (keys.length > 1_000) throw new Error("MEDIA_VALIDATION_FAILED");
    keys.forEach(assertControlledKey);
    const result = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (Array.isArray(result.Errors) && result.Errors.length > 0) {
      throw new Error("MEDIA_STORAGE_UNAVAILABLE");
    }
  }

  async list(prefix: string, cursor: string | undefined, limit: number) {
    assertControlledKey(prefix);
    if (cursor && (cursor.length > 4_096 || /[\r\n]/.test(cursor))) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000) {
      throw new Error("MEDIA_VALIDATION_FAILED");
    }
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: limit,
      }),
    );
    const contents = Array.isArray(result.Contents)
      ? (result.Contents as Array<Record<string, unknown>>)
      : [];
    return {
      objects: contents.flatMap((object) => {
        const objectKey = text(object.Key);
        if (!objectKey) return [];
        assertControlledKey(objectKey);
        return [
          {
            key: objectKey,
            size: Number(object.Size ?? 0),
            etag: text(object.ETag) ?? "",
            contentType: "application/octet-stream",
            uploadedAt:
              object.LastModified instanceof Date
                ? object.LastModified
                : this.now(),
          },
        ];
      }),
      ...(result.IsTruncated && text(result.NextContinuationToken)
        ? { cursor: text(result.NextContinuationToken)! }
        : {}),
    };
  }
}
