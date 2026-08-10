-- Enforce the Phase 8 transition graph at the authoritative database boundary.

create function private.enforce_lead_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if not (
    (old.status = 'NEW' and new.status in ('CONTACTED', 'LOST')) or
    (old.status = 'CONTACTED' and new.status in ('QUALIFIED', 'LOST')) or
    (old.status = 'QUALIFIED' and new.status in ('VIEWING', 'LOST')) or
    (old.status = 'VIEWING' and new.status in ('NEGOTIATION', 'LOST')) or
    (old.status = 'NEGOTIATION' and new.status in ('WON', 'LOST'))
  ) then
    raise exception 'invalid lead lifecycle transition from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.enforce_lead_lifecycle() from public, anon, authenticated;

create trigger enforce_lead_lifecycle_transition
  before update of status on public.leads
  for each row execute function private.enforce_lead_lifecycle();

-- CRM data remains server-mediated in V1. RLS policies do not substitute for grants.
revoke all on table public.lead_contact_intakes from public, anon, authenticated;
revoke all on table public.lead_activities from public, anon, authenticated;
revoke all on table public.lead_assignment_history from public, anon, authenticated;
