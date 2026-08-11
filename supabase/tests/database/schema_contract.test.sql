begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

select extensions.is(
  (select count(*)::bigint from pg_catalog.pg_tables where schemaname='public'),
  49::bigint, 'canonical public schema has exactly 49 tables after Phase 9 appointment event history'
);
select extensions.is(
  (select count(*)::bigint from pg_catalog.pg_tables where schemaname='public' and rowsecurity),
  49::bigint, 'RLS is enabled on all 49 canonical tables'
);
select extensions.is(
  (select count(*)::bigint from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity),
  49::bigint, 'RLS is forced on all 49 canonical tables'
);
select extensions.is(
  (select count(*)::bigint from pg_catalog.pg_policies where schemaname='public' and 'anon'=any(roles)),
  0::bigint, 'anon has no RLS policy'
);
select extensions.is(
  (select count(*)::bigint from pg_catalog.pg_policies where schemaname='public' and policyname like 'advisor_%' and cmd in ('ALL','DELETE')),
  0::bigint, 'ADVISOR has no ALL or DELETE policy'
);
select extensions.is(
  (select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')),
  0::bigint, 'Data API roles have no base table grants'
);
select extensions.is(
  (select count(*)::bigint from information_schema.columns
   where table_schema='public' and column_name='id' and data_type='uuid'
     and column_default is distinct from 'gen_random_uuid()'),
  0::bigint, 'all UUID id columns default to gen_random_uuid()'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conname='appointments_no_advisor_overlap' and contype='x'),
  'appointment overlap exclusion constraint exists'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_tables where schemaname='public' and tablename='appointment_events'),
  'appointment event history is canonical'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conname='public_route_property_taxonomy' and contype='c'),
  'canonical property URL taxonomy check exists'
);
select extensions.is((select count(*)::bigint from public.roles), 2::bigint, 'only two V1 roles are seeded');
select extensions.is((select string_agg(code,',' order by code) from public.roles), 'ADMIN,ADVISOR', 'role codes are exact');
select extensions.is((select string_agg(code,',' order by code) from public.listing_types), 'KIRALIK,SATILIK', 'listing types are exact');
select extensions.is((select count(*)::bigint from public.property_types), 0::bigint, 'property types are not seeded');
select extensions.ok(
  not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.prosecdef and not ('search_path=""' = any(coalesce(p.proconfig,'{}'::text[])))
  ), 'security-definer functions use an empty safe search_path'
);

select * from extensions.finish();
rollback;
