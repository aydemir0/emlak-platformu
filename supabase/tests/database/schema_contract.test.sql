begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(43);

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
select extensions.is(
  (select count(*)::bigint from information_schema.columns where table_schema='public' and table_name='customer_requests' and column_name in ('matching_location_state','matching_budget_state','matching_property_type_state','matching_rooms_state','matching_net_area_state','matching_features_state','net_area_min','net_area_max')),
  8::bigint, 'matching profile columns are present without adding a table'
);
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_location_state_check'), 'location state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_budget_state_check'), 'budget state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_property_type_state_check'), 'property type state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_rooms_state_check'), 'rooms state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_net_area_state_check'), 'net area state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_features_state_check'), 'feature state is constrained');
select extensions.ok(exists (select 1 from pg_catalog.pg_constraint where conname='customer_requests_matching_net_area_state_range_check'), 'net area state/range invariant exists');
select extensions.is((select column_default from information_schema.columns where table_schema='public' and table_name='customer_requests' and column_name='matching_net_area_state'), '''MISSING''::text', 'legacy requests default to MISSING');
select extensions.throws_ok($$with c as (insert into public.customers(display_name) values ('tap negative min') returning id) insert into public.customer_requests(customer_id, net_area_min) select id, -1 from c$$, '23514', null, 'negative net_area_min is rejected');
select extensions.throws_ok($$with c as (insert into public.customers(display_name) values ('tap negative max') returning id) insert into public.customer_requests(customer_id, net_area_max) select id, -1 from c$$, '23514', null, 'negative net_area_max is rejected');
select extensions.throws_ok($$with c as (insert into public.customers(display_name) values ('tap inverted area') returning id) insert into public.customer_requests(customer_id, matching_net_area_state, net_area_min, net_area_max) select id, 'CONSTRAINED', 20, 10 from c$$, '23514', null, 'inverted constrained net area is rejected');
select extensions.lives_ok($$with c as (insert into public.customers(display_name) values ('tap valid area') returning id) insert into public.customer_requests(customer_id, matching_net_area_state, net_area_min, net_area_max) select id, 'CONSTRAINED', 10, 20 from c$$, 'valid constrained net area is accepted');

select extensions.is(
  (select count(*)::bigint from information_schema.columns
   where table_schema='public' and table_name='lead_conversions'
     and column_name in ('customer_request_id','resolution_kind','resolution_evidence_code')),
  3::bigint, 'lead conversion provenance columns are present'
);
select extensions.is(
  (select count(*)::bigint from information_schema.columns
   where table_schema='public' and table_name='lead_conversions'
     and column_name in ('customer_request_id','resolution_kind','resolution_evidence_code')
     and is_nullable='YES'),
  3::bigint, 'lead conversion provenance remains nullable for legacy rows'
);
select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class source_table on source_table.oid=fk.conrelid
    join pg_catalog.pg_namespace source_schema on source_schema.oid=source_table.relnamespace
    join pg_catalog.pg_class target_table on target_table.oid=fk.confrelid
    join pg_catalog.pg_namespace target_schema on target_schema.oid=target_table.relnamespace
    where fk.conname='lead_conversions_customer_request_id_fkey'
      and source_schema.nspname='public' and source_table.relname='lead_conversions'
      and target_schema.nspname='public' and target_table.relname='customer_requests'
  ), 'conversion request provenance references customer requests'
);
select extensions.is(
  (select fk.confdeltype
   from pg_catalog.pg_constraint fk
   where fk.conname='lead_conversions_customer_request_id_fkey'),
  'r', 'conversion request provenance uses ON DELETE RESTRICT'
);
select extensions.lives_ok($sql$
  with customer as (
    insert into public.customers(display_name) values ('tap conversion provenance customer') returning id
  ), lead as (
    insert into public.leads(submission_id,source,status,email)
    values (gen_random_uuid(),'TAP','NEW','provenance@example.test') returning id
  ), customer_request as (
    insert into public.customer_requests(customer_id) select id from customer returning id
  )
  insert into public.lead_conversions(
    lead_id, customer_id, customer_request_id, outcome, resolution_code,
    resolution_kind, resolution_evidence_code, idempotency_key, correlation_id
  )
  select lead.id, customer.id, customer_request.id, 'CONVERTED', 'TAP_PROVENANCE',
    'LINKED_EXACT_IDENTITY', 'EXACT_EMAIL_AND_PHONE', gen_random_uuid(), gen_random_uuid()
  from lead, customer, customer_request;
$sql$, 'valid bounded conversion provenance codes are accepted');
select extensions.throws_ok($sql$
  with customer as (
    insert into public.customers(display_name) values ('tap invalid conversion kind customer') returning id
  ), lead as (
    insert into public.leads(submission_id,source,status,email)
    values (gen_random_uuid(),'TAP','NEW','invalid-kind@example.test') returning id
  )
  insert into public.lead_conversions(
    lead_id, customer_id, outcome, resolution_code, resolution_kind,
    idempotency_key, correlation_id
  )
  select lead.id, customer.id, 'CONVERTED', 'TAP_INVALID_KIND', 'UNBOUNDED',
    gen_random_uuid(), gen_random_uuid()
  from lead, customer;
$sql$, '23514', null, 'invalid conversion resolution kind is rejected');
select extensions.throws_ok($sql$
  with customer as (
    insert into public.customers(display_name) values ('tap invalid evidence customer') returning id
  ), lead as (
    insert into public.leads(submission_id,source,status,email)
    values (gen_random_uuid(),'TAP','NEW','invalid-evidence@example.test') returning id
  )
  insert into public.lead_conversions(
    lead_id, customer_id, outcome, resolution_code, resolution_evidence_code,
    idempotency_key, correlation_id
  )
  select lead.id, customer.id, 'CONVERTED', 'TAP_INVALID_EVIDENCE', 'RAW_EMAIL',
    gen_random_uuid(), gen_random_uuid()
  from lead, customer;
$sql$, '23514', null, 'invalid conversion evidence code is rejected');
select extensions.lives_ok($sql$
  with customer as (
    insert into public.customers(display_name) values ('tap legacy conversion customer') returning id
  ), lead as (
    insert into public.leads(submission_id,source,status,email)
    values (gen_random_uuid(),'TAP','NEW','legacy-conversion@example.test') returning id
  )
  insert into public.lead_conversions(
    lead_id, customer_id, outcome, resolution_code, idempotency_key, correlation_id
  )
  select lead.id, customer.id, 'CONVERTED', 'LEGACY', gen_random_uuid(), gen_random_uuid()
  from lead, customer;
$sql$, 'legacy conversion rows remain valid with null new provenance fields');
select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.lead_conversions'::regclass and contype='u'
      and conkey=array[(select attnum from pg_catalog.pg_attribute
                         where attrelid='public.lead_conversions'::regclass and attname='lead_id')]
  ), 'one lead remains limited to one conversion record'
);
select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.lead_conversions'::regclass and contype='u'
      and conkey=array[(select attnum from pg_catalog.pg_attribute
                         where attrelid='public.lead_conversions'::regclass and attname='idempotency_key')]
  ), 'conversion idempotency key remains unique'
);
select extensions.is(
  (select data_type from information_schema.columns
   where table_schema='public' and table_name='lead_conversions' and column_name='correlation_id'),
  'uuid', 'conversion correlation identifier remains a UUID'
);
select extensions.is(
  (select is_nullable from information_schema.columns
   where table_schema='public' and table_name='lead_conversions' and column_name='correlation_id'),
  'NO', 'conversion correlation identifier remains required'
);
select extensions.ok(
  (select rowsecurity from pg_catalog.pg_tables
   where schemaname='public' and tablename='lead_conversions'),
  'conversion provenance remains RLS protected'
);
select extensions.is(
  (select count(*)::bigint from information_schema.role_table_grants
   where table_schema='public' and table_name='lead_conversions' and grantee='anon'),
  0::bigint, 'anon receives no conversion provenance base-table grant'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_indexes
          where schemaname='public' and indexname='lead_conversions_customer_request_id_idx'),
  'conversion request provenance has a supporting index'
);

select * from extensions.finish();
rollback;
