-- Phase 11 Package F: conversion is explicitly eligible from QUALIFIED,
-- VIEWING, or NEGOTIATION. Keep the ordinary forward progression and LOST
-- exits intact while allowing the conversion command's atomic WON transition.
-- Every WON transition requires the immutable conversion row that the command
-- inserts earlier in the same transaction; ordinary status updates therefore
-- cannot manufacture WON without conversion provenance.

create or replace function private.enforce_lead_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if not (
    (old.status = 'NEW' and new.status in ('CONTACTED', 'LOST')) or
    (old.status = 'CONTACTED' and new.status in ('QUALIFIED', 'LOST')) or
    (old.status = 'QUALIFIED' and (
      new.status in ('VIEWING', 'LOST') or
      (new.status = 'WON' and exists (
        select 1 from public.lead_conversions
        where lead_id = new.id and outcome = 'WON'
      ))
    )) or
    (old.status = 'VIEWING' and (
      new.status in ('NEGOTIATION', 'LOST') or
      (new.status = 'WON' and exists (
        select 1 from public.lead_conversions
        where lead_id = new.id and outcome = 'WON'
      ))
    )) or
    (old.status = 'NEGOTIATION' and (
      new.status = 'LOST' or
      (new.status = 'WON' and exists (
        select 1 from public.lead_conversions
        where lead_id = new.id and outcome = 'WON'
      ))
    ))
  ) then
    raise exception 'invalid lead lifecycle transition from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.enforce_lead_lifecycle() from public, anon, authenticated;
