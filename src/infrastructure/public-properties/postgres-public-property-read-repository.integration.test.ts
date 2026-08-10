import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PostgresPublicPropertyReadRepository } from "@/infrastructure/public-properties/postgres-public-property-read-repository.server";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const citySlug = `sehir-${suffix}`;
const districtSlug = `ilce-${suffix}`;
const propertyTypeSlug = `daire-${suffix}`;
const cityId = randomUUID();
const districtId = randomUUID();
const neighborhoodId = randomUUID();
const propertyTypeId = randomUUID();

type Fixture = Readonly<{
  currentRoute: string;
  oldRoute?: string;
  publicVariantPath?: string;
}>;

let client: PoolClient | undefined;
let repository: PostgresPublicPropertyReadRepository;
let redacted: Fixture;
let exact: Fixture;
let privateMediaOnly: Fixture;
let passive: Fixture;

function database(): PoolClient {
  if (client === undefined) throw new Error("TEST_DATABASE_NOT_READY");
  return client;
}

async function createPropertyFixture(input: {
  state: "ACTIVE" | "PASSIVE";
  locationId: string;
  locationVisibility: "EXACT" | "APPROXIMATE";
  mediaVisibility: "PUBLIC" | "PRIVATE";
  includeHistory?: boolean;
}): Promise<Fixture> {
  const propertyId = randomUUID();
  const routeReservationId = randomUUID();
  const propertySlug = `ilan-${randomUUID().slice(0, 8)}`;
  const currentRoute = `/satilik/${citySlug}/${districtSlug}/${propertyTypeSlug}/${propertySlug}`;
  const oldSlug = `eski-${propertySlug}`;
  const oldRoute = input.includeHistory
    ? `/satilik/${citySlug}/${districtSlug}/${propertyTypeSlug}/${oldSlug}`
    : undefined;

  await database().query(
    `insert into public.public_route_reservations(id,route_key,route_kind)
    values($1,$2,'property')`,
    [routeReservationId, currentRoute],
  );
  await database().query(
    `insert into public.properties(
      id,public_id,listing_type_id,property_type_id,location_id,current_route_reservation_id,
      current_slug,title,current_state,short_description,description,price_amount_minor,currency_code,
      gross_area_sqm,net_area_sqm,bedroom_count,bathroom_count,address_line,latitude,longitude,
      location_visibility,published_at)
    values($1,$2,'30000000-0000-4000-8000-000000000001',$3,$4,$5,$6,$7,$8,
      'Public fixture summary','Public fixture description',123450000,'TRY',125,110,3,2,
      'Gizli Sokak 42',39.925533,32.866287,$9,now())`,
    [
      propertyId,
      `PUBLIC-${randomUUID()}`,
      propertyTypeId,
      input.locationId,
      routeReservationId,
      propertySlug,
      `Public fixture ${propertySlug}`,
      input.state,
      input.locationVisibility,
    ],
  );

  if (oldRoute !== undefined) {
    const oldReservationId = randomUUID();
    await database().query(
      `insert into public.public_route_reservations(id,route_key,route_kind,retired_at)
      values($1,$2,'property',now())`,
      [oldReservationId, oldRoute],
    );
    await database().query(
      `insert into public.property_slug_history(
        id,property_id,route_reservation_id,slug,valid_from,retired_at)
      values($1,$2,$3,$4,now()-interval '1 day',now())`,
      [randomUUID(), propertyId, oldReservationId, oldSlug],
    );
  }

  const mediaId = randomUUID();
  const recipeVersion = "public-read-v1";
  await database().query(
    `insert into public.property_media(
      id,property_id,state,visibility,media_role,source_version,sort_order,is_cover,
      original_object_key,checksum_sha256,detected_mime_type,width_px,height_px,byte_size,
      alt_text,ready_at,current_recipe_version,processor_version)
    values($1,$2,'READY',$3,'PHOTO',1,1,true,$4,$5,'image/jpeg',1600,900,2048,
      'Public fixture image',now(),$6,'integration-test')`,
    [
      mediaId,
      propertyId,
      input.mediaVisibility,
      `private/originals/${mediaId}/source`,
      "a".repeat(64),
      recipeVersion,
    ],
  );

  const publicVariantPath = `public/properties/${mediaId}/${recipeVersion}/800.webp`;
  await database().query(
    `insert into public.property_media_variants(
      id,property_media_id,source_version,recipe_version,format,width_px,height_px,byte_size,
      object_key,checksum_sha256,purged_at)
    values
      ($1,$2,1,$3,'WEBP',800,450,512,$4,$5,null),
      ($6,$2,1,'retired-recipe','WEBP',400,225,256,$7,$5,null),
      ($8,$2,1,$3,'AVIF',800,450,384,$9,$5,now())`,
    [
      randomUUID(),
      mediaId,
      recipeVersion,
      publicVariantPath,
      "b".repeat(64),
      randomUUID(),
      `public/properties/${mediaId}/retired/400.webp`,
      randomUUID(),
      `public/properties/${mediaId}/${recipeVersion}/purged.avif`,
    ],
  );

  return { currentRoute, oldRoute, publicVariantPath };
}

describe("Postgres public property read repository", () => {
  beforeAll(async () => {
    client = await pool.connect();
    await client.query("begin");
    await client.query(
      `insert into public.property_types(id,code,label)
      values($1,$2,'Integration Daire')`,
      [propertyTypeId, `PUBLIC_${suffix.toUpperCase()}`],
    );
    await client.query(
      `insert into public.locations(id,level,parent_id,parent_level,name,normalized_name,status)
      values
        ($1,'CITY',null,null,'Integration Şehir',$4,'active'),
        ($2,'DISTRICT',$1,'CITY','Integration İlçe',$5,'active'),
        ($3,'NEIGHBORHOOD',$2,'DISTRICT','Integration Mahalle',$6,'active')`,
      [
        cityId,
        districtId,
        neighborhoodId,
        `integration-sehir-${suffix}`,
        `integration-ilce-${suffix}`,
        `integration-mahalle-${suffix}`,
      ],
    );

    redacted = await createPropertyFixture({
      state: "ACTIVE",
      locationId: neighborhoodId,
      locationVisibility: "APPROXIMATE",
      mediaVisibility: "PUBLIC",
      includeHistory: true,
    });
    exact = await createPropertyFixture({
      state: "ACTIVE",
      locationId: districtId,
      locationVisibility: "EXACT",
      mediaVisibility: "PUBLIC",
    });
    privateMediaOnly = await createPropertyFixture({
      state: "ACTIVE",
      locationId: districtId,
      locationVisibility: "EXACT",
      mediaVisibility: "PRIVATE",
    });
    passive = await createPropertyFixture({
      state: "PASSIVE",
      locationId: cityId,
      locationVisibility: "EXACT",
      mediaVisibility: "PUBLIC",
    });
    repository = new PostgresPublicPropertyReadRepository(client);
  });

  afterAll(async () => {
    if (client !== undefined) {
      await client.query("rollback");
      client.release();
    }
    await pool.end();
  });

  it("resolves only an ACTIVE current route with current public media variants", async () => {
    const result = await repository.getByRoute(redacted.currentRoute);

    expect(result).toMatchObject({ kind: "PROPERTY" });
    if (result.kind !== "PROPERTY") throw new Error("EXPECTED_PROPERTY");
    expect(result.property.media).toEqual([
      expect.objectContaining({
        variants: [
          expect.objectContaining({ deliveryPath: redacted.publicVariantPath }),
        ],
      }),
    ]);
    await expect(
      repository.getByRoute(privateMediaOnly.currentRoute),
    ).resolves.toEqual({
      kind: "NOT_FOUND",
    });
    await expect(repository.getByRoute(passive.currentRoute)).resolves.toEqual({
      kind: "NOT_FOUND",
    });
  });

  it("redirects a historical route directly to its publicly eligible canonical route", async () => {
    await expect(repository.getByRoute(redacted.oldRoute!)).resolves.toEqual({
      kind: "REDIRECT",
      status: 301,
      location: redacted.currentRoute,
    });
  });

  it("removes address and coordinates for every non-EXACT visibility value", async () => {
    const result = await repository.getByRoute(redacted.currentRoute);

    if (result.kind !== "PROPERTY") throw new Error("EXPECTED_PROPERTY");
    expect(result.property.location).toEqual({
      locationVisibility: "REDACTED",
      city: "Integration Şehir",
      citySlug,
      district: "Integration İlçe",
      districtSlug,
    });
    expect(result.property.location).not.toHaveProperty("addressLine");
    expect(result.property.location).not.toHaveProperty("latitude");
    expect(result.property.location).not.toHaveProperty("longitude");
  });

  it("returns exact address fields only for the EXACT visibility value", async () => {
    const result = await repository.getByRoute(exact.currentRoute);

    if (result.kind !== "PROPERTY") throw new Error("EXPECTED_PROPERTY");
    expect(result.property.location).toMatchObject({
      locationVisibility: "EXACT",
      addressLine: "Gizli Sokak 42",
      latitude: 39.925533,
      longitude: 32.866287,
    });
  });

  it("loads a filtered listing and total in one bounded SQL call", async () => {
    let queryCount = 0;
    const countingDatabase = {
      query: async (text: string, values?: readonly unknown[]) => {
        queryCount += 1;
        return database().query(text, values as never);
      },
    };
    const countingRepository = new PostgresPublicPropertyReadRepository(
      countingDatabase as never,
    );

    const result = await countingRepository.list({
      listingType: "SATILIK",
      search: { city: citySlug, page: 1 },
    });

    expect(queryCount).toBe(1);
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.slug).sort()).toEqual(
      [redacted.currentRoute, exact.currentRoute]
        .map((route) => route.split("/").at(-1)!)
        .sort(),
    );
    expect(result.items.every((item) => item.media.length === 1)).toBe(true);
  });

  it("lists only current publicly eligible canonical sitemap entries", async () => {
    const entries = await repository.listSitemapEntries();
    const paths = entries.map((entry) => entry.path);

    expect(paths).toEqual(
      expect.arrayContaining([redacted.currentRoute, exact.currentRoute]),
    );
    expect(paths).not.toContain(redacted.oldRoute);
    expect(paths).not.toContain(privateMediaOnly.currentRoute);
    expect(paths).not.toContain(passive.currentRoute);
  });
});
