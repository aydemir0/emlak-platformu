import "server-only";

import type { Pool } from "pg";

import type {
  PublicPropertyDetail,
  PublicPropertyLocation,
  PublicPropertyMedia,
} from "@/application/public-properties/public-property-contracts";
import type {
  PublicPropertyListQuery,
  PublicPropertyReadRepository,
  PublicRouteResolution,
  PublicSitemapEntry,
} from "@/application/public-properties/public-property-read-ports";
import {
  buildCanonicalListingPath,
  getIndexability,
  type PublicListingType,
} from "@/domain/public-properties/public-property-seo";
import { getDatabasePool } from "@/infrastructure/postgres/pool.server";

const PAGE_SIZE = 24;
const MAXIMUM_PAGE = 100;
const SITEMAP_PAGE_SIZE = 10_000;
const MAXIMUM_SITEMAP_PAGES = 1_000;

type Queryable = Pick<Pool, "query">;

type PublicPropertyRow = Readonly<{
  public_id: string;
  title: string;
  short_description: string | null;
  description: string | null;
  price_amount_minor: string;
  currency_code: string;
  gross_area_sqm: string | null;
  net_area_sqm: string | null;
  bedroom_count: number | null;
  bathroom_count: number | null;
  property_type_label: string;
  listing_type: PublicListingType;
  city: string;
  city_slug: string;
  district: string;
  district_slug: string;
  property_type_slug: string;
  slug: string;
  location_visibility: string | null;
  address_line: string | null;
  latitude: string | null;
  longitude: string | null;
  media: PublicPropertyMedia[];
  updated_at: Date;
  total_count?: string;
}>;

const LOCATION_JOINS = `
join public.locations property_location on property_location.id=p.location_id
left join public.locations district_location on district_location.id=case
  when property_location.level='NEIGHBORHOOD' then property_location.parent_id
  when property_location.level='DISTRICT' then property_location.id
  else null end
join public.locations city_location on city_location.id=case
  when property_location.level='NEIGHBORHOOD' then district_location.parent_id
  when property_location.level='DISTRICT' then property_location.parent_id
  else property_location.id end`;

const PUBLIC_MEDIA_JOIN = `
join lateral (
  select jsonb_agg(jsonb_build_object(
    'mediaId',eligible_media.media_id,
    'isCover',eligible_media.is_cover,
    'sortOrder',eligible_media.sort_order,
    'altText',eligible_media.alt_text,
    'variants',eligible_media.variants
  ) order by eligible_media.sort_order,eligible_media.media_id) as items
  from (
    select pm.id as media_id,pm.is_cover,pm.sort_order,pm.alt_text,
      jsonb_agg(jsonb_build_object(
        'width',v.width_px,
        'height',v.height_px,
        'format',v.format,
        'deliveryPath',v.object_key
      ) order by v.width_px,v.format) as variants
    from public.property_media pm
    join public.property_media_variants v on v.property_media_id=pm.id
      and v.source_version=pm.source_version
      and v.recipe_version=pm.current_recipe_version
      and v.purged_at is null
    where pm.property_id=p.id
      and pm.state='READY'
      and pm.visibility='PUBLIC'
      and pm.deleted_at is null
      and pm.ready_at is not null
    group by pm.id
  ) eligible_media
) public_media on public_media.items is not null`;

const PUBLIC_MEDIA_EXISTS = `exists(
  select 1
  from public.property_media pm
  join public.property_media_variants v on v.property_media_id=pm.id
    and v.source_version=pm.source_version
    and v.recipe_version=pm.current_recipe_version
    and v.purged_at is null
  where pm.property_id=p.id
    and pm.state='READY'
    and pm.visibility='PUBLIC'
    and pm.deleted_at is null
    and pm.ready_at is not null
)`;

const PUBLIC_PROPERTY_SELECT = `select
  p.public_id,p.title,p.short_description,p.description,p.price_amount_minor::text,
  p.currency_code,p.gross_area_sqm::text,p.net_area_sqm::text,p.bedroom_count,
  p.bathroom_count,pt.label as property_type_label,lt.code as listing_type,
  city_location.name as city,split_part(rr.route_key,'/',3) as city_slug,
  coalesce(district_location.name,city_location.name) as district,
  split_part(rr.route_key,'/',4) as district_slug,
  split_part(rr.route_key,'/',5) as property_type_slug,
  split_part(rr.route_key,'/',6) as slug,p.location_visibility,
  case when p.location_visibility='EXACT' then p.address_line else null end as address_line,
  case when p.location_visibility='EXACT' then p.latitude::text else null end as latitude,
  case when p.location_visibility='EXACT' then p.longitude::text else null end as longitude,
  public_media.items as media,p.updated_at
from public.properties p
join public.public_route_reservations rr on rr.id=p.current_route_reservation_id
join public.listing_types lt on lt.id=p.listing_type_id
join public.property_types pt on pt.id=p.property_type_id
${LOCATION_JOINS}
${PUBLIC_MEDIA_JOIN}`;

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapLocation(row: PublicPropertyRow): PublicPropertyLocation {
  const base = {
    city: row.city,
    citySlug: row.city_slug,
    district: row.district,
    districtSlug: row.district_slug,
  };
  if (row.location_visibility !== "EXACT") {
    return { ...base, locationVisibility: "REDACTED" };
  }
  return {
    ...base,
    locationVisibility: "EXACT",
    addressLine: row.address_line,
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
  };
}

function mapProperty(row: PublicPropertyRow): PublicPropertyDetail {
  return {
    publicId: row.public_id,
    title: row.title,
    shortDescription: row.short_description,
    description: row.description,
    price: {
      amountMinor: Number(row.price_amount_minor),
      currencyCode: row.currency_code,
    },
    propertyTypeLabel: row.property_type_label,
    listingType: row.listing_type,
    citySlug: row.city_slug,
    districtSlug: row.district_slug,
    propertyTypeSlug: row.property_type_slug,
    slug: row.slug,
    location: mapLocation(row),
    media: row.media,
    grossAreaSqm: optionalNumber(row.gross_area_sqm),
    netAreaSqm: optionalNumber(row.net_area_sqm),
    bedroomCount: row.bedroom_count,
    bathroomCount: row.bathroom_count,
    updatedAt: row.updated_at,
  };
}

function hasFilters(query: PublicPropertyListQuery): boolean {
  return [
    query.search.city,
    query.search.district,
    query.search.propertyType,
    query.search.minPrice,
    query.search.maxPrice,
    query.search.roomCount,
  ].some((value) => value !== undefined);
}

export class PostgresPublicPropertyReadRepository implements PublicPropertyReadRepository {
  constructor(private readonly database: Queryable = getDatabasePool()) {}

  async getByRoute(route: string): Promise<PublicRouteResolution> {
    const current = await this.database.query<PublicPropertyRow>(
      `${PUBLIC_PROPERTY_SELECT}
      where rr.route_key=$1
        and rr.retired_at is null
        and p.current_state='ACTIVE'
        and p.deleted_at is null
        and lt.code in('SATILIK','KIRALIK')
      limit 1`,
      [route],
    );
    if (current.rows[0] !== undefined) {
      return { kind: "PROPERTY", property: mapProperty(current.rows[0]) };
    }

    const historical = await this.database.query<{ location: string }>(
      `select current_route.route_key as location
      from public.public_route_reservations requested_route
      join public.property_slug_history history on history.route_reservation_id=requested_route.id
      join public.properties p on p.id=history.property_id
      join public.public_route_reservations current_route on current_route.id=p.current_route_reservation_id
      join public.listing_types lt on lt.id=p.listing_type_id
      where requested_route.route_key=$1
        and requested_route.retired_at is not null
        and current_route.retired_at is null
        and p.current_state='ACTIVE'
        and p.deleted_at is null
        and lt.code in('SATILIK','KIRALIK')
        and ${PUBLIC_MEDIA_EXISTS}
      limit 1`,
      [route],
    );
    return historical.rows[0] === undefined
      ? { kind: "NOT_FOUND" }
      : {
          kind: "REDIRECT",
          status: 301,
          location: historical.rows[0].location,
        };
  }

  async list(query: PublicPropertyListQuery) {
    const page = Math.min(Math.max(query.search.page, 1), MAXIMUM_PAGE);
    const offset = (page - 1) * PAGE_SIZE;
    const result = await this.database.query<PublicPropertyRow>(
      `select public_rows.*,count(*) over()::text as total_count
      from (${PUBLIC_PROPERTY_SELECT}
        where rr.retired_at is null
          and p.current_state='ACTIVE'
          and p.deleted_at is null
          and lt.code=$1
      ) public_rows
      where ($2::text is null or public_rows.city_slug=$2)
        and ($3::text is null or public_rows.district_slug=$3)
        and ($4::text is null or public_rows.property_type_slug=$4)
        and ($5::bigint is null or public_rows.price_amount_minor::bigint >= $5)
        and ($6::bigint is null or public_rows.price_amount_minor::bigint <= $6)
        and ($7::smallint is null or public_rows.bedroom_count=$7)
      order by public_rows.updated_at desc,public_rows.public_id
      limit $8 offset $9`,
      [
        query.listingType,
        query.search.city ?? null,
        query.search.district ?? null,
        query.search.propertyType ?? null,
        query.search.minPrice ?? null,
        query.search.maxPrice ?? null,
        query.search.roomCount ?? null,
        PAGE_SIZE,
        offset,
      ],
    );
    const normalizedSearch = { ...query.search, page };
    return {
      items: result.rows.map(mapProperty),
      query: normalizedSearch,
      page,
      total: Number(result.rows[0]?.total_count ?? 0),
      canonicalPath: buildCanonicalListingPath(
        query.listingType,
        normalizedSearch,
      ),
      indexability: getIndexability({
        hasFilters: hasFilters({ ...query, search: normalizedSearch }),
        page,
      }),
    };
  }

  async countSitemapPages(): Promise<number> {
    const result = await this.database.query<{ total: string }>(
      `select count(*)::text as total
      from public.properties p
      join public.public_route_reservations rr on rr.id=p.current_route_reservation_id
      join public.listing_types lt on lt.id=p.listing_type_id
      where rr.retired_at is null
        and p.current_state='ACTIVE'
        and p.deleted_at is null
        and lt.code in('SATILIK','KIRALIK')
        and ${PUBLIC_MEDIA_EXISTS}`,
    );
    const pageCount = Math.max(
      1,
      Math.ceil(Number(result.rows[0]?.total ?? 0) / SITEMAP_PAGE_SIZE),
    );
    if (pageCount > MAXIMUM_SITEMAP_PAGES) {
      throw new Error("PUBLIC_SITEMAP_PAGE_LIMIT_EXCEEDED");
    }
    return pageCount;
  }

  async listSitemapEntries(
    page: number,
  ): Promise<readonly PublicSitemapEntry[]> {
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page >= MAXIMUM_SITEMAP_PAGES
    ) {
      throw new Error("PUBLIC_SITEMAP_PAGE_INVALID");
    }
    const result = await this.database.query<{
      path: string;
      listing_type: PublicListingType;
      city_slug: string;
      district_slug: string;
      property_type_slug: string;
      slug: string;
      last_modified: Date;
    }>(
      `select rr.route_key as path,lt.code as listing_type,
      split_part(rr.route_key,'/',3) as city_slug,
      split_part(rr.route_key,'/',4) as district_slug,
      split_part(rr.route_key,'/',5) as property_type_slug,
      split_part(rr.route_key,'/',6) as slug,p.updated_at as last_modified
      from public.properties p
      join public.public_route_reservations rr on rr.id=p.current_route_reservation_id
      join public.listing_types lt on lt.id=p.listing_type_id
      where rr.retired_at is null
        and p.current_state='ACTIVE'
        and p.deleted_at is null
        and lt.code in('SATILIK','KIRALIK')
        and ${PUBLIC_MEDIA_EXISTS}
      order by p.id
      limit $1 offset $2`,
      [SITEMAP_PAGE_SIZE, page * SITEMAP_PAGE_SIZE],
    );
    return result.rows.map((row) => ({
      path: row.path,
      listingType: row.listing_type,
      citySlug: row.city_slug,
      districtSlug: row.district_slug,
      propertyTypeSlug: row.property_type_slug,
      slug: row.slug,
      lastModified: row.last_modified,
    }));
  }
}
