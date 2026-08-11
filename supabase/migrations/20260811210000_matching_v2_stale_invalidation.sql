-- Matching V2 extends the existing stale marker; it does not alter result history.
create or replace function private.mark_property_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(old.listing_type_id,old.property_type_id,old.location_id,old.price_amount_minor,
         old.currency_code,old.bedroom_count,old.net_area_sqm,old.current_state,old.deleted_at)
     is distinct from row(new.listing_type_id,new.property_type_id,new.location_id,new.price_amount_minor,
                          new.currency_code,new.bedroom_count,new.net_area_sqm,new.current_state,new.deleted_at) then
    update public.property_customer_matches set status='STALE'
      where property_id=new.id and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  end if;
  return new;
end
$$;

create or replace function private.mark_request_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(old.status,old.listing_type_id,old.property_type_id,old.location_id,old.budget_min_minor,
         old.budget_max_minor,old.currency_code,old.bedrooms_min,old.bedrooms_max,old.net_area_min,
         old.net_area_max,old.matching_location_state,old.matching_budget_state,
         old.matching_property_type_state,old.matching_rooms_state,old.matching_net_area_state,
         old.matching_features_state,old.deleted_at)
     is distinct from row(new.status,new.listing_type_id,new.property_type_id,new.location_id,new.budget_min_minor,
                          new.budget_max_minor,new.currency_code,new.bedrooms_min,new.bedrooms_max,new.net_area_min,
                          new.net_area_max,new.matching_location_state,new.matching_budget_state,
                          new.matching_property_type_state,new.matching_rooms_state,new.matching_net_area_state,
                          new.matching_features_state,new.deleted_at) then
    update public.property_customer_matches set status='STALE'
      where customer_request_id=new.id and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  end if;
  return new;
end
$$;

create or replace function private.mark_request_feature_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.property_customer_matches set status='STALE'
    where customer_request_id in (old.customer_request_id, new.customer_request_id)
      and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  return coalesce(new, old);
end
$$;

create trigger mark_request_feature_matches_stale
after insert or update or delete on public.customer_request_features
for each row execute function private.mark_request_feature_matches_stale();

create or replace function private.mark_property_feature_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.property_customer_matches set status='STALE'
    where property_id in (old.property_id, new.property_id)
      and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  return coalesce(new, old);
end
$$;

create trigger mark_property_feature_matches_stale
after insert or update or delete on public.property_feature_assignments
for each row execute function private.mark_property_feature_matches_stale();

revoke all on function private.mark_request_feature_matches_stale() from public, anon, authenticated;
revoke all on function private.mark_property_feature_matches_stale() from public, anon, authenticated;
