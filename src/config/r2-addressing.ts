const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";
const DNS_LABEL = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type R2AddressingInput = Readonly<{
  accountId: string;
  bucketName: string;
}>;

export type R2Addressing = Readonly<{
  endpoint: string;
  uploadOrigin: string;
}>;

export function getR2Addressing(input: R2AddressingInput): R2Addressing | null {
  if (!DNS_LABEL.test(input.accountId) || !DNS_LABEL.test(input.bucketName)) {
    return null;
  }

  const endpoint = `https://${input.accountId}${R2_HOST_SUFFIX}`;
  return {
    endpoint,
    uploadOrigin: `https://${input.bucketName}.${input.accountId}${R2_HOST_SUFFIX}`,
  };
}
