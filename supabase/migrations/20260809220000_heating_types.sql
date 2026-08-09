-- Phase 5: separate, initially empty heating reference. No vocabulary is seeded.
create table public.heating_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz
);

alter table public.properties
  add column heating_type_id uuid,
  add constraint properties_heating_type_id_fkey foreign key (heating_type_id)
    references public.heating_types(id) on update restrict on delete restrict;

create index properties_heating_type_active_idx
  on public.properties (heating_type_id)
  where heating_type_id is not null and deleted_at is null;

alter table public.heating_types enable row level security;
alter table public.heating_types force row level security;

create policy admin_all on public.heating_types
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on table public.heating_types from public, anon, authenticated;
