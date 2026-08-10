-- Durable, PII-minimized details for lead activity evidence.

alter table public.lead_activities
  add column details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object');
