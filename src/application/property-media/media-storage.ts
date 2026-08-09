export type StoredObjectMetadata = Readonly<{
  key: string;
  size: number;
  etag: string;
  checksumSha256?: string;
  contentType: string;
  uploadedAt: Date;
}>;

export type StoredObject = Readonly<{
  bytes: Uint8Array;
  metadata: StoredObjectMetadata;
}>;

export type UploadGrant = Readonly<{
  method: "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}>;

export interface MediaStorage {
  presignPut(
    input: Readonly<{
      key: string;
      contentType: string;
      expiresInSeconds: number;
      maximumBytes: number;
    }>,
  ): Promise<UploadGrant>;
  head(key: string): Promise<StoredObjectMetadata | null>;
  get(key: string, maximumBytes: number): Promise<StoredObject | null>;
  put(
    input: Readonly<{
      key: string;
      bytes: Uint8Array;
      contentType: string;
      checksumSha256: string;
      cacheControl?: string;
      ifAbsent: boolean;
    }>,
  ): Promise<StoredObjectMetadata>;
  delete(keys: readonly string[]): Promise<void>;
  list(
    prefix: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{
    objects: readonly StoredObjectMetadata[];
    cursor?: string;
  }>;
}
