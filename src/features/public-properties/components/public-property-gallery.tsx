import type {
  PublicPropertyMedia,
  PublicPropertyMediaVariant,
} from "@/application/public-properties/public-property-contracts";

const DELIVERY_PREFIXES = ["delivery/properties/", "public/properties/"];

export function getSafePublicMediaPath(
  variant: PublicPropertyMediaVariant,
): string | null {
  if (
    variant.deliveryPath.includes("\\") ||
    variant.deliveryPath.includes("?")
  ) {
    return null;
  }

  const path = variant.deliveryPath.replace(/^\/+/, "");
  const segments = path.split("/");
  const expectedExtension = `.${variant.format.toLocaleLowerCase("en-US")}`;
  if (
    !DELIVERY_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    segments.some(
      (segment) => !/^[a-zA-Z0-9._-]+$/.test(segment) || segment === "..",
    ) ||
    !path.toLocaleLowerCase("en-US").endsWith(expectedExtension)
  ) {
    return null;
  }

  return `/${path}`;
}

function responsiveCandidates(
  media: PublicPropertyMedia,
  format: PublicPropertyMediaVariant["format"],
) {
  return media.variants
    .filter((variant) => variant.format === format)
    .map((variant) => ({ variant, path: getSafePublicMediaPath(variant) }))
    .filter(
      (
        candidate,
      ): candidate is { variant: PublicPropertyMediaVariant; path: string } =>
        candidate.path !== null,
    )
    .sort((left, right) => left.variant.width - right.variant.width);
}

function sourceSet(
  candidates: readonly {
    variant: PublicPropertyMediaVariant;
    path: string;
  }[],
): string {
  return candidates
    .map(({ path, variant }) => `${path} ${variant.width}w`)
    .join(", ");
}

export function PublicPropertyGallery({
  media,
  title,
}: Readonly<{
  media: readonly PublicPropertyMedia[];
  title: string;
}>) {
  if (media.length === 0) {
    return (
      <div
        aria-label={`${title} için görsel hazırlanıyor`}
        className="bg-muted aspect-[4/3] rounded-xl"
        role="img"
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {media.map((item, index) => {
        const webp = responsiveCandidates(item, "WEBP");
        const avif = responsiveCandidates(item, "AVIF");
        const fallbackCandidates = webp.length > 0 ? webp : avif;
        const fallback = fallbackCandidates.at(-1);
        if (fallback === undefined) return null;

        return (
          <picture
            className={index === 0 ? "sm:col-span-2" : undefined}
            key={item.mediaId}
          >
            {avif.length > 0 ? (
              <source
                data-testid="avif-source"
                sizes="(min-width: 1024px) 960px, 100vw"
                srcSet={sourceSet(avif)}
                type="image/avif"
              />
            ) : null}
            <img
              alt={item.altText?.trim() || `${title} görseli`}
              className="aspect-[4/3] h-auto w-full rounded-xl object-cover"
              decoding="async"
              fetchPriority={item.isCover ? "high" : "auto"}
              height={fallback.variant.height}
              loading={item.isCover ? "eager" : "lazy"}
              sizes="(min-width: 1024px) 960px, 100vw"
              src={fallback.path}
              srcSet={sourceSet(fallbackCandidates)}
              width={fallback.variant.width}
            />
          </picture>
        );
      })}
    </div>
  );
}
