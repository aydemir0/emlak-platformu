-- Package D evidence: on 100,000 representative lead rows the rate-window
-- query used leads_public_intake_idx, touched 380 buffers, and took 2.041 ms.
-- This partial composite index changed the plan to a 3-buffer index-only scan
-- at 0.039 ms. The extra write cost is one narrow B-tree entry per active
-- public lead with a network signal.
set lock_timeout = '5s';
set statement_timeout = '2min';

create index leads_abuse_network_created_at_idx
  on public.leads (abuse_network_signal, created_at)
  where deleted_at is null and abuse_network_signal is not null;

-- Feature tables have mutable metadata. Avoid rewriting every current match
-- when an UPDATE does not change an authoritative matching input.
create or replace function private.mark_request_feature_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and row(old.customer_request_id,old.feature_id,old.priority,old.value_text,
             old.value_number,old.value_boolean)
         is not distinct from
         row(new.customer_request_id,new.feature_id,new.priority,new.value_text,
             new.value_number,new.value_boolean) then
    return new;
  end if;

  update public.property_customer_matches set status='STALE'
    where customer_request_id in (old.customer_request_id, new.customer_request_id)
      and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  return coalesce(new, old);
end
$$;

create or replace function private.mark_property_feature_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and row(old.property_id,old.feature_id,old.value_text,old.value_number,
             old.value_boolean)
         is not distinct from
         row(new.property_id,new.feature_id,new.value_text,new.value_number,
             new.value_boolean) then
    return new;
  end if;

  update public.property_customer_matches set status='STALE'
    where property_id in (old.property_id, new.property_id)
      and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  return coalesce(new, old);
end
$$;

revoke all on function private.mark_request_feature_matches_stale() from public, anon, authenticated;
revoke all on function private.mark_property_feature_matches_stale() from public, anon, authenticated;
