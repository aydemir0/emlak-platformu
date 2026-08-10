-- Phase 9 Package B: expand the legacy customer-owned appointment relation for
-- lead-owned CRM appointments. No legacy row is backfilled, deleted, or
-- reinterpreted in this migration.

alter table public.appointments
  add column lead_id uuid references public.leads(id) on update restrict on delete restrict,
  add column scheduled_timezone text,
  add column created_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  add column updated_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  add column resolution_reason_code text,
  add column resolution_note text,
  alter column customer_id drop not null,
  alter column appointment_type drop not null,
  add constraint appointments_scheduled_timezone_nonblank
    check (scheduled_timezone is null or btrim(scheduled_timezone) <> ''),
  add constraint appointments_resolution_reason_code_nonblank
    check (resolution_reason_code is null or btrim(resolution_reason_code) <> ''),
  add constraint appointments_resolution_note_nonblank
    check (resolution_note is null or btrim(resolution_note) <> ''),
  add constraint appointments_resolution_fields_terminal
    check (
      (resolution_reason_code is null and resolution_note is null)
      or status in ('CANCELLED', 'NO_SHOW')
    );

-- The legacy constraint held all non-cancelled rows. Package 9 only reserves
-- time for currently actionable states, so completed/no-show rows release the
-- advisor slot. Half-open interval semantics are retained.
alter table public.appointments
  drop constraint if exists appointments_no_advisor_overlap,
  add constraint appointments_no_advisor_overlap
    exclude using gist (
      advisor_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (
      advisor_id is not null
      and status in ('REQUESTED', 'CONFIRMED')
      and deleted_at is null
    );

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on update restrict on delete restrict,
  event_type text not null check (event_type in (
    'CREATED',
    'CONFIRMED',
    'RESCHEDULED',
    'CANCELLED',
    'COMPLETED',
    'NO_SHOW',
    'ASSIGNED',
    'REASSIGNED'
  )),
  actor_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  correlation_id uuid not null,
  source_idempotency_key text unique,
  occurred_at timestamptz not null default now(),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now()
);

create index appointments_lead_starts_idx
  on public.appointments(lead_id, starts_at desc, id desc)
  where lead_id is not null and deleted_at is null;
create index appointment_events_appointment_occurred_idx
  on public.appointment_events(appointment_id, occurred_at desc, id desc);
create index appointment_events_actor_occurred_idx
  on public.appointment_events(actor_user_identity_id, occurred_at desc)
  where actor_user_identity_id is not null;
create index appointment_events_correlation_idx
  on public.appointment_events(correlation_id, occurred_at desc);

create function private.can_manage_lead(lead_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (
    private.has_role('ADVISOR') and exists (
      select 1 from public.leads l
      where l.id=lead_key
        and l.assigned_advisor_id=private.current_advisor_id()
        and l.deleted_at is null
    )
  )
$$;
revoke all on function private.can_manage_lead(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_lead(uuid) to authenticated;

-- The old advisor policies would permit a new lead-owned row through its
-- optional legacy customer link. Replace them with a conservative split:
-- legacy rows (lead_id is null) retain customer scope; Phase 9 rows require
-- advisor self-assignment and trusted lead scope.
drop policy if exists advisor_appointments_select on public.appointments;
drop policy if exists advisor_appointments_insert on public.appointments;
drop policy if exists advisor_appointments_update on public.appointments;

create policy advisor_appointments_select on public.appointments for select to authenticated
  using (
    advisor_id=(select private.current_advisor_id())
    and (
      (lead_id is null and (select private.can_manage_customer(customer_id)))
      or (lead_id is not null and (select private.can_manage_lead(lead_id)))
    )
  );
create policy advisor_appointments_insert on public.appointments for insert to authenticated
  with check (
    advisor_id=(select private.current_advisor_id())
    and (
      (lead_id is null and (select private.can_manage_customer(customer_id)))
      or (lead_id is not null and (select private.can_manage_lead(lead_id)))
    )
  );
create policy advisor_appointments_update on public.appointments for update to authenticated
  using (
    advisor_id=(select private.current_advisor_id())
    and (
      (lead_id is null and (select private.can_manage_customer(customer_id)))
      or (lead_id is not null and (select private.can_manage_lead(lead_id)))
    )
  )
  with check (
    advisor_id=(select private.current_advisor_id())
    and (
      (lead_id is null and (select private.can_manage_customer(customer_id)))
      or (lead_id is not null and (select private.can_manage_lead(lead_id)))
    )
  );

alter table public.appointment_events enable row level security;
alter table public.appointment_events force row level security;
revoke all on table public.appointment_events from public, anon, authenticated;

create policy admin_all on public.appointment_events for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy advisor_appointment_events_select on public.appointment_events for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id=appointment_id
        and a.advisor_id=(select private.current_advisor_id())
        and (
          (a.lead_id is null and (select private.can_manage_customer(a.customer_id)))
          or (a.lead_id is not null and (select private.can_manage_lead(a.lead_id)))
        )
    )
  );

create function private.enforce_appointment_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if not (
    (old.status = 'REQUESTED' and new.status in ('CONFIRMED', 'CANCELLED'))
    or (old.status = 'CONFIRMED' and new.status in ('COMPLETED', 'CANCELLED', 'NO_SHOW'))
  ) then
    raise exception 'invalid appointment lifecycle transition from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end
$$;
revoke all on function private.enforce_appointment_lifecycle() from public, anon, authenticated;
create trigger enforce_appointment_lifecycle_transition
  before update of status on public.appointments
  for each row execute function private.enforce_appointment_lifecycle();

create function private.prevent_appointment_event_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'appointment events are append-only' using errcode='55000';
end
$$;
revoke all on function private.prevent_appointment_event_mutation() from public, anon, authenticated;
create trigger prevent_appointment_event_mutation
  before update or delete on public.appointment_events
  for each row execute function private.prevent_appointment_event_mutation();
