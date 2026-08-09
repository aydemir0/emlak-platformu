-- Align the database guard with the approved Phase 2 lifecycle graph.
create or replace function private.enforce_property_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare allowed boolean;
begin
  if new.current_state = old.current_state then return new; end if;
  allowed := case old.current_state
    when 'DRAFT' then new.current_state in ('REVIEW','ARCHIVED')
    when 'REVIEW' then new.current_state in ('DRAFT','ACTIVE','ARCHIVED')
    when 'ACTIVE' then new.current_state in ('REVIEW','RESERVED','PASSIVE','ARCHIVED')
    when 'RESERVED' then new.current_state in ('ACTIVE','SOLD','RENTED','PASSIVE','ARCHIVED')
    when 'PASSIVE' then new.current_state in ('REVIEW','ARCHIVED')
    when 'SOLD' then new.current_state = 'ARCHIVED'
    when 'RENTED' then new.current_state = 'ARCHIVED'
    when 'ARCHIVED' then new.current_state = 'DRAFT'
    else false end;
  if not allowed then
    raise exception 'invalid property transition: % -> %', old.current_state, new.current_state using errcode='23514';
  end if;
  if new.current_state = 'ACTIVE' and (new.current_route_reservation_id is null or new.published_at is null or new.deleted_at is not null) then
    raise exception 'ACTIVE property requires current route, published_at, and no deleted_at' using errcode='23514';
  end if;
  return new;
end
$$;

revoke all on function private.enforce_property_transition() from public, anon, authenticated;
