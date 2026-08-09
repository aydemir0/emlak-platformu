begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

select extensions.has_table('public', 'heating_types', 'heating types is a separate reference table');
select extensions.is_empty('select * from public.heating_types', 'heating vocabulary is intentionally empty');

insert into public.property_types(id,code,label) values ('95000000-0000-4000-8000-000000000001','PHASE5_TEST','Phase 5 Test');
insert into public.locations(id,level,name,normalized_name) values ('95000000-0000-4000-8000-000000000002','CITY','Phase 5 Test','phase-5-test');
insert into public.heating_types(id,code,label) values ('95000000-0000-4000-8000-000000000003','PHASE5_TEST','Phase 5 Test');
insert into public.properties(id,public_id,listing_type_id,property_type_id,location_id,heating_type_id,title,current_state)
values ('95000000-0000-4000-8000-000000000004','phase5-test','30000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000003','Phase 5 Test','DRAFT');
select extensions.col_is_null('public', 'properties', 'heating_type_id', 'heating type is optional');
select extensions.fk_ok('public', 'properties', 'heating_type_id', 'public', 'heating_types', 'id', 'property heating FK exists');
select extensions.is(
  (select confupdtype::text || confdeltype::text from pg_catalog.pg_constraint where conname='properties_heating_type_id_fkey'),
  'rr', 'heating FK explicitly restricts update and delete'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid='public.heating_types'::regclass),
  'heating types has enabled and forced RLS'
);

select extensions.throws_ok(
  $$delete from public.heating_types where id='95000000-0000-4000-8000-000000000003'$$,
  '23503', null, 'referenced heating type cannot be deleted'
);
select extensions.throws_ok(
  $$update public.heating_types set id='95000000-0000-4000-8000-000000000099' where id='95000000-0000-4000-8000-000000000003'$$,
  '23503', null, 'referenced heating type identifier cannot be updated'
);
select extensions.throws_ok(
  $$update public.properties set latitude=41 where id='95000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'coordinates must be supplied together'
);
select extensions.throws_ok(
  $$update public.properties set latitude=91,longitude=181 where id='95000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'coordinate ranges are enforced'
);
select extensions.throws_ok(
  $$update public.properties set gross_area_sqm=100,net_area_sqm=101 where id='95000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'net area cannot exceed gross area'
);
select extensions.throws_ok(
  $$update public.properties set living_room_count=-1 where id='95000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'nonnegative property counts are enforced'
);
select extensions.throws_ok(
  $$update public.properties set location_visibility='exact' where id='95000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'stored location visibility is normalized'
);
select extensions.has_column('public', 'properties', 'short_description', 'short description exists');
select extensions.has_column('public', 'properties', 'gross_area_sqm', 'gross area exists');
select extensions.has_column('public', 'properties', 'net_area_sqm', 'net area exists');
select extensions.has_column('public', 'properties', 'living_room_count', 'living room count exists');
select extensions.has_column('public', 'properties', 'building_age_years', 'building age exists');
select extensions.has_column('public', 'properties', 'floor_number', 'floor number exists');
select extensions.has_column('public', 'properties', 'total_floor_count', 'total floor count exists');
select extensions.has_column('public', 'properties', 'furnished', 'furnished exists');
select extensions.has_column('public', 'properties', 'address_line', 'address exists');
select extensions.has_column('public', 'properties', 'latitude', 'latitude exists');
select extensions.has_column('public', 'properties', 'longitude', 'longitude exists');
select extensions.has_column('public', 'properties', 'location_visibility', 'location visibility storage exists');
select extensions.ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname='public' and indexname='properties_heating_type_active_idx'),
  'active-property heating lookup index exists'
);

select * from extensions.finish();
rollback;
