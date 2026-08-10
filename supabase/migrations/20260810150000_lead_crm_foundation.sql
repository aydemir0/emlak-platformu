-- Phase 8 Package A: lead lifecycle, durable intake evidence, and append-only CRM history.

alter table public.leads
  drop constraint if exists leads_status_check,
  add constraint leads_status_check check (status in ('NEW','CONTACTED','QUALIFIED','VIEWING','NEGOTIATION','WON','LOST')),
  add column idempotency_fingerprint text,
  add column abuse_network_signal text,
  add constraint leads_idempotency_fingerprint_format
    check (idempotency_fingerprint is null or idempotency_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint leads_abuse_network_signal_format
    check (abuse_network_signal is null or abuse_network_signal ~ '^[0-9a-f]{64}$');

create table public.lead_contact_intakes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on update restrict on delete restrict,
  channel text not null check (channel in ('EMAIL','PHONE')),
  raw_value text not null check (btrim(raw_value) <> ''),
  normalized_value text check (normalized_value is null or btrim(normalized_value) <> ''),
  normalization_algorithm text not null check (btrim(normalization_algorithm) <> ''),
  normalization_version text not null check (btrim(normalization_version) <> ''),
  source text not null check (btrim(source) <> ''),
  created_at timestamptz not null default now()
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on update restrict on delete restrict,
  activity_type text not null check (activity_type in ('CREATED','NOTE_ADDED','STATUS_CHANGED','ASSIGNMENT_CHANGED','DUPLICATE_CANDIDATE_DETECTED','CONTACT_ATTEMPTED','CONVERSION_RECORDED')),
  summary text,
  occurred_at timestamptz not null,
  created_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  correlation_id uuid not null,
  source_idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table public.lead_assignment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on update restrict on delete restrict,
  from_advisor_id uuid references public.advisors(id) on update restrict on delete restrict,
  to_advisor_id uuid references public.advisors(id) on update restrict on delete restrict,
  assigned_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  reason_code text,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  source_idempotency_key text unique,
  check (from_advisor_id is distinct from to_advisor_id)
);

create index leads_public_intake_idx on public.leads(property_id, created_at desc) where deleted_at is null;
create index leads_advisor_status_updated_idx on public.leads(assigned_advisor_id, status, updated_at desc) where deleted_at is null;
create index leads_idempotency_fingerprint_idx on public.leads(idempotency_fingerprint) where idempotency_fingerprint is not null;
create index lead_contact_intakes_normalized_idx on public.lead_contact_intakes(channel, normalized_value) where normalized_value is not null;
create index lead_contact_intakes_lead_idx on public.lead_contact_intakes(lead_id, created_at);
create index lead_activities_lead_idx on public.lead_activities(lead_id, occurred_at desc);
create index lead_activities_actor_idx on public.lead_activities(created_by_user_identity_id, occurred_at desc);
create index lead_assignment_history_lead_idx on public.lead_assignment_history(lead_id, occurred_at desc);

alter table public.lead_contact_intakes enable row level security;
alter table public.lead_contact_intakes force row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_activities force row level security;
alter table public.lead_assignment_history enable row level security;
alter table public.lead_assignment_history force row level security;

create policy admin_all on public.lead_contact_intakes for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all on public.lead_activities for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_all on public.lead_assignment_history for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy advisor_lead_activities_select on public.lead_activities for select to authenticated
  using (exists (select 1 from public.leads l where l.id=lead_id and l.assigned_advisor_id=(select private.current_advisor_id())));
create policy advisor_lead_assignment_history_select on public.lead_assignment_history for select to authenticated
  using (exists (select 1 from public.leads l where l.id=lead_id and l.assigned_advisor_id=(select private.current_advisor_id())));

create function private.prevent_lead_history_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'lead history is append-only' using errcode='55000';
end
$$;
revoke all on function private.prevent_lead_history_mutation() from public, anon, authenticated;
create trigger prevent_lead_activities_mutation before update or delete on public.lead_activities
  for each row execute function private.prevent_lead_history_mutation();
create trigger prevent_lead_assignment_history_mutation before update or delete on public.lead_assignment_history
  for each row execute function private.prevent_lead_history_mutation();
