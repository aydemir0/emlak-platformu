begin;
select extensions.plan(7);

insert into public.property_types(id,code,label) values ('41000000-0000-4000-8000-000000000001','TEST','Test');
insert into public.locations(id,level,name,normalized_name) values ('41000000-0000-4000-8000-000000000002','CITY','İstanbul','istanbul');
insert into public.advisors(id,display_name,status) values ('41000000-0000-4000-8000-000000000003','Test Advisor','active');
insert into public.customers(id,display_name,assigned_advisor_id) values ('41000000-0000-4000-8000-000000000004','Test Customer','41000000-0000-4000-8000-000000000003');

select extensions.lives_ok($sql$
  insert into public.public_route_reservations(id,route_key,route_kind)
    values ('41000000-0000-4000-8000-000000000005','/satilik/istanbul/kadikoy/daire/test-ilan','property');
  insert into public.properties(id,public_id,listing_type_id,property_type_id,location_id,current_route_reservation_id,current_slug,title,current_state)
    values ('41000000-0000-4000-8000-000000000006','TEST-1','30000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',
      '41000000-0000-4000-8000-000000000005','test-ilan','Test ilan','DRAFT');
  set constraints all immediate;
  set constraints all deferred;
$sql$, 'a canonical route with exactly one property owner commits its constraints');

select extensions.throws_ok($sql$
  insert into public.public_route_reservations(route_key,route_kind) values ('/wrong/path','property');
$sql$, '23514', null, 'noncanonical property route is rejected');

insert into public.appointments(id,customer_id,advisor_id,starts_at,ends_at,status,appointment_type)
values ('41000000-0000-4000-8000-000000000007','41000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000003',
  '2026-08-10 10:00+03','2026-08-10 11:00+03','CONFIRMED','VIEWING');
select extensions.throws_ok($sql$
  insert into public.appointments(customer_id,advisor_id,starts_at,ends_at,status,appointment_type)
  values ('41000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000003',
    '2026-08-10 10:30+03','2026-08-10 11:30+03','REQUESTED','VIEWING');
$sql$, '23P01', null, 'overlapping same-advisor appointment is rejected');

insert into public.audit_logs(id,action,target_type,target_id,outcome)
values ('41000000-0000-4000-8000-000000000008','test','property','41000000-0000-4000-8000-000000000006','succeeded');
select extensions.throws_ok($sql$
  update public.audit_logs set action='tampered' where id='41000000-0000-4000-8000-000000000008';
$sql$, '55000', 'audit_logs is append-only', 'audit log mutation is rejected');

insert into public.property_media(id,property_id,state,visibility,media_role,sort_order,is_cover)
values ('41000000-0000-4000-8000-000000000009','41000000-0000-4000-8000-000000000006','UPLOADED','PRIVATE','PHOTO',1,true);
select extensions.throws_ok($sql$
  insert into public.property_media(property_id,state,visibility,media_role,sort_order,is_cover)
  values ('41000000-0000-4000-8000-000000000006','UPLOADED','PRIVATE','PHOTO',2,true);
$sql$, '23505', null, 'a second active cover is rejected');

select extensions.throws_ok($sql$
  insert into public.outbox_messages(event_name,owning_domain,aggregate_type,event_version,aggregate_id,correlation_id,idempotency_key,status)
  values ('test.created','test','property',1,'41000000-0000-4000-8000-000000000006',gen_random_uuid(),'bad-processing','PROCESSING');
$sql$, '23514', null, 'PROCESSING outbox row requires a recoverable lease');

select extensions.ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='outbox_messages_lease_idx'),
  'expired processing leases have a recovery index'
);

select * from extensions.finish();
rollback;
