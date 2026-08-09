-- Phase 5: additive, nullable property facts. Product vocabularies remain outside this migration.
alter table public.properties
  add column short_description text,
  add column gross_area_sqm numeric(12,2),
  add column net_area_sqm numeric(12,2),
  add column living_room_count smallint,
  add column building_age_years smallint,
  add column floor_number smallint,
  add column total_floor_count smallint,
  add column furnished boolean,
  add column address_line text,
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add column location_visibility text,
  add constraint properties_short_description_nonblank check (short_description is null or btrim(short_description) <> ''),
  add constraint properties_gross_area_nonnegative check (gross_area_sqm is null or gross_area_sqm >= 0),
  add constraint properties_net_area_nonnegative check (net_area_sqm is null or net_area_sqm >= 0),
  add constraint properties_net_not_greater_than_gross check (net_area_sqm is null or gross_area_sqm is null or net_area_sqm <= gross_area_sqm),
  add constraint properties_living_room_count_nonnegative check (living_room_count is null or living_room_count >= 0),
  add constraint properties_building_age_nonnegative check (building_age_years is null or building_age_years >= 0),
  add constraint properties_total_floor_count_nonnegative check (total_floor_count is null or total_floor_count >= 0),
  add constraint properties_address_nonblank check (address_line is null or btrim(address_line) <> ''),
  add constraint properties_coordinates_paired check ((latitude is null) = (longitude is null)),
  add constraint properties_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint properties_longitude_range check (longitude is null or longitude between -180 and 180),
  add constraint properties_location_visibility_normalized check (
    location_visibility is null
    or (location_visibility = upper(btrim(location_visibility)) and btrim(location_visibility) <> '')
  );
