import type { StaffPrincipal } from "@/application/auth/staff-principal";

export type AdminMediaItem = Readonly<{
  id: string;
  state: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
  visibility: "PRIVATE" | "PUBLIC";
  sortOrder: number;
  isCover: boolean;
  version: bigint;
  failureCode: string | null;
  failureRetryable: boolean | null;
  variants: readonly {
    width: number;
    format: "WEBP" | "AVIF";
    deliveryPath: string;
  }[];
}>;

export type PublicMediaDescriptor = Readonly<{
  mediaId: string;
  isCover: boolean;
  sortOrder: number;
  altText: string | null;
  variants: readonly {
    width: number;
    height: number;
    format: "WEBP" | "AVIF";
    deliveryPath: string;
  }[];
}>;

export interface MediaReadRepository {
  listAdminPropertyMedia(
    actor: StaffPrincipal,
    propertyId: string,
  ): Promise<readonly AdminMediaItem[]>;
  listPublicPropertyMedia(
    propertyId: string,
  ): Promise<readonly PublicMediaDescriptor[]>;
}
