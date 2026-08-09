import "server-only";

import type { Pool } from "pg";

import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  PropertyListItem,
  PropertyListQuery,
  PropertyReadRepository,
} from "@/application/properties/property-ports";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";
import { mapProperty } from "@/infrastructure/properties/postgres-property-unit-of-work.server";

export class PostgresPropertyReadRepository implements PropertyReadRepository {
  constructor(
    private readonly pool: Pick<Pool, "query"> = getLocalDatabasePool(),
  ) {}

  async list(actor: StaffPrincipal, input: PropertyListQuery) {
    const orderBy = {
      updated_desc: "p.updated_at desc,p.id desc",
      updated_asc: "p.updated_at asc,p.id asc",
      price_desc: "p.price_amount_minor desc nulls last,p.id desc",
      price_asc: "p.price_amount_minor asc nulls last,p.id asc",
    }[input.sort ?? "updated_desc"];
    const result = await this.pool.query<{
      id: string;
      public_id: string;
      title: string;
      current_state: PropertyListItem["state"];
      listing_type_label: string;
      property_type_label: string;
      location_name: string;
      price_amount_minor: string | null;
      currency_code: string | null;
      version: string;
      total_count: string;
      advisor_names: string[];
      updated_at: Date;
    }>(
      `select p.id,p.public_id,p.title,p.current_state,lt.label as listing_type_label,
        pt.label as property_type_label,l.name as location_name,p.price_amount_minor,p.currency_code,p.version,
        p.updated_at,count(*) over()::text as total_count,coalesce(assignment.advisor_names,'{}') as advisor_names
      from public.properties p
      join public.listing_types lt on lt.id=p.listing_type_id
      join public.property_types pt on pt.id=p.property_type_id
      join public.locations l on l.id=p.location_id
      left join public.advisors a on a.user_identity_id=$1 and a.status='active' and a.deleted_at is null
      left join lateral (select array_agg(ad.display_name order by paa.is_primary desc,ad.display_name) as advisor_names
        from public.property_advisor_assignments paa join public.advisors ad on ad.id=paa.advisor_id
        where paa.property_id=p.id and paa.ended_at is null) assignment on true
      where p.deleted_at is null and ($2='ADMIN' or exists(
        select 1 from public.property_advisor_assignments paa
        where paa.property_id=p.id and paa.advisor_id=a.id and paa.ended_at is null))
        and ($5::text is null or p.current_state=$5)
        and ($6::uuid is null or p.listing_type_id=$6)
        and ($7::uuid is null or exists(select 1 from public.property_advisor_assignments paa where paa.property_id=p.id and paa.advisor_id=$7 and paa.ended_at is null))
        and ($8::uuid is null or p.location_id=$8)
        and ($9::text is null or p.title ilike '%' || $9 || '%' or p.public_id ilike '%' || $9 || '%')
      order by ${orderBy} limit $3 offset $4`,
      [
        actor.identityId,
        actor.role,
        input.limit,
        input.offset,
        input.status ?? null,
        input.listingTypeId ?? null,
        input.advisorId ?? null,
        input.locationId ?? null,
        input.search?.trim() || null,
      ],
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        publicId: row.public_id,
        title: row.title,
        state: row.current_state,
        listingTypeLabel: row.listing_type_label,
        propertyTypeLabel: row.property_type_label,
        locationName: row.location_name,
        priceAmountMinor:
          row.price_amount_minor === null
            ? null
            : BigInt(row.price_amount_minor),
        currencyCode: row.currency_code,
        version: BigInt(row.version),
        advisorNames: row.advisor_names,
        updatedAt: row.updated_at,
      })),
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async get(actor: StaffPrincipal, propertyId: string) {
    const result = await this.pool.query(
      `select p.* from public.properties p
      left join public.advisors a on a.user_identity_id=$2 and a.status='active' and a.deleted_at is null
      where p.id=$1 and p.deleted_at is null and ($3='ADMIN' or exists(select 1 from public.property_advisor_assignments paa
        where paa.property_id=p.id and paa.advisor_id=a.id and paa.ended_at is null))`,
      [propertyId, actor.identityId, actor.role],
    );
    return result.rows[0] ? mapProperty(result.rows[0]) : null;
  }

  async getReferenceData() {
    const pool = this.pool;
    const [listingTypes, propertyTypes, locations, heatingTypes, advisors] =
      await Promise.all([
        pool.query<{ id: string; label: string }>(
          "select id,label from public.listing_types where status='active' and deleted_at is null order by label,id",
        ),
        pool.query<{ id: string; label: string }>(
          "select id,label from public.property_types where status='active' and deleted_at is null order by label,id",
        ),
        pool.query<{
          id: string;
          name: string;
          level: "CITY" | "DISTRICT" | "NEIGHBORHOOD";
          parentId: string | null;
        }>(
          "select id,name,level,parent_id as \"parentId\" from public.locations where status='active' and deleted_at is null order by level,name,id",
        ),
        pool.query<{ id: string; label: string }>(
          "select id,label from public.heating_types where status='active' and deleted_at is null order by label,id",
        ),
        pool.query<{ id: string; name: string }>(
          "select id,display_name as name from public.advisors where status='active' and deleted_at is null order by display_name,id",
        ),
      ]);
    return {
      listingTypes: listingTypes.rows,
      propertyTypes: propertyTypes.rows,
      locations: locations.rows,
      heatingTypes: heatingTypes.rows,
      advisors: advisors.rows,
    };
  }
}
