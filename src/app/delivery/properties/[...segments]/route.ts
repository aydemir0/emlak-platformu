import { buildVariantKey } from "@/domain/property-media/object-key";
import { PROPERTY_V1_RECIPE } from "@/domain/property-media/media";
import { getMediaStorage } from "@/infrastructure/property-media/media-storage-factory.server";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

function publicVariantKey(segments: readonly string[]): string | null {
  if (segments.length !== 5) return null;
  const [propertyId, mediaId, sourceVersion, recipeVersion, filename] =
    segments;
  const match = /^(\d+)\.(webp|avif)$/.exec(filename ?? "");
  if (!match || recipeVersion !== PROPERTY_V1_RECIPE.version) return null;
  try {
    return buildVariantKey({
      propertyId: propertyId ?? "",
      mediaId: mediaId ?? "",
      sourceVersion: Number(sourceVersion),
      recipeVersion,
      width: Number(match[1]),
      format: match[2] as "webp" | "avif",
    });
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  const key = publicVariantKey((await context.params).segments);
  if (!key) return notFound();

  const object = await getMediaStorage().get(
    key,
    PROPERTY_V1_RECIPE.maximumVariantBytes,
  );
  if (!object) return notFound();
  if (!["image/webp", "image/avif"].includes(object.metadata.contentType)) {
    return notFound();
  }

  const body = new Uint8Array(object.bytes.byteLength);
  body.set(object.bytes);
  return new Response(body.buffer, {
    headers: {
      "Cache-Control": IMMUTABLE_CACHE,
      "Content-Length": String(object.bytes.byteLength),
      "Content-Type": object.metadata.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
