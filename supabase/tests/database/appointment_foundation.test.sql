begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

insert into public.advisors(id,display_name,status)
values ('92000000-0000-4000-8000-000000000001','Appointment Advisor','active');
insert into public.customers(id,display_name,assigned_advisor_id)
values ('92000000-0000-4000-8000-000000000002','Legacy Customer','92000000-0000-4000-8000-000000000001');
insert into public.leads(id,submission_id,assigned_advisor_id,status,source,phone)
values ('92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000001','NEW','TEST','+905550000000');

select extensions.lives_ok($sql$
  insert into public.appointments(id,customer_id,advisor_id,starts_at,ends_at,status,appointment_type)
  values ('92000000-0000-4000-8000-000000000005','92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001','2026-09-01 10:00+03','2026-09-01 11:00+03','REQUESTED','VIEWING');
$sql$, 'legacy customer-owned appointment remains valid');

select extensions.lives_ok($sql$
  insert into public.appointments(id,lead_id,advisor_id,starts_at,ends_at,status,scheduled_timezone)
  values ('92000000-0000-4000-8000-000000000006','92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000001','2026-09-01 11:00+03','2026-09-01 12:00+03','REQUESTED','Europe/Istanbul');
$sql$, 'lead-owned appointment can omit legacy customer and appointment type');

select extensions.throws_ok($sql$
  insert into public.appointments(lead_id,advisor_id,starts_at,ends_at,status,scheduled_timezone)
  values ('92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001',
    '2026-09-01 10:30+03','2026-09-01 11:30+03','CONFIRMED','Europe/Istanbul');
$sql$, '23P01', null, 'requested and confirmed appointments cannot overlap');

insert into public.appointments(id,lead_id,advisor_id,starts_at,ends_at,status,scheduled_timezone)
values ('92000000-0000-4000-8000-000000000007','92000000-0000-4000-8000-000000000003',
  '92000000-0000-4000-8000-000000000001','2026-09-01 13:00+03','2026-09-01 14:00+03','COMPLETED','Europe/Istanbul');
select extensions.lives_ok($sql$
  insert into public.appointments(lead_id,advisor_id,starts_at,ends_at,status,scheduled_timezone)
  values ('92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001',
    '2026-09-01 13:00+03','2026-09-01 14:00+03','REQUESTED','Europe/Istanbul');
$sql$, 'terminal appointment releases an advisor slot');

select extensions.lives_ok($sql$
  update public.appointments set status='CONFIRMED'
  where id='92000000-0000-4000-8000-000000000005';
$sql$, 'requested appointment can be confirmed');
select extensions.throws_ok($sql$
  update public.appointments set status='REQUESTED'
  where id='92000000-0000-4000-8000-000000000005';
$sql$, '23514', 'invalid appointment lifecycle transition from CONFIRMED to REQUESTED',
  'terminal/reopening lifecycle paths are rejected');

insert into public.appointment_events(id,appointment_id,event_type,correlation_id,event_data)
values ('92000000-0000-4000-8000-000000000009','92000000-0000-4000-8000-000000000005',
  'CONFIRMED','92000000-0000-4000-8000-000000000010','{}'::jsonb);
select extensions.throws_ok($sql$
  update public.appointment_events set event_type='CANCELLED'
  where id='92000000-0000-4000-8000-000000000009';
$sql$, '55000', 'appointment events are append-only', 'appointment event update is rejected');
select extensions.throws_ok($sql$
  delete from public.appointment_events where id='92000000-0000-4000-8000-000000000009';
$sql$, '55000', 'appointment events are append-only', 'appointment event delete is rejected');

select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid='public.appointment_events'::regclass),
  'appointment events have forced RLS'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_policies where schemaname='public'
    and tablename='appointment_events' and policyname='advisor_appointment_events_select' and cmd='SELECT'),
  'advisor event visibility has an appointment-scoped policy'
);

select * from extensions.finish();
rollback;
