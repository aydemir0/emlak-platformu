create function private.set_mutable_metadata()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  new.version := old.version + 1;
  return new;
end
$$;
revoke all on function private.set_mutable_metadata() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'user_identities','advisors','roles','permissions','listing_types','property_types',
    'locations','properties','property_features','media_upload_sessions','property_media',
    'leads','customers','customer_contact_points','customer_requests','appointments',
    'property_customer_matches','seo_pages','seo_page_query_definitions','content_entries',
    'analytics_event_definitions','site_settings'
  ] loop
    execute format('create trigger set_mutable_metadata before update on public.%I for each row execute function private.set_mutable_metadata()', table_name);
  end loop;
end
$$;

create function private.enforce_variant_immutability()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='DELETE' then raise exception 'property_media_variants are immutable; record purge evidence instead' using errcode='55000'; end if;
  if row(new.property_media_id,new.source_version,new.recipe_version,new.format,new.width_px,new.height_px,new.byte_size,new.object_key,new.checksum_sha256,new.created_at)
     is distinct from row(old.property_media_id,old.source_version,old.recipe_version,old.format,old.width_px,old.height_px,old.byte_size,old.object_key,old.checksum_sha256,old.created_at) then
    raise exception 'property_media_variants content is immutable' using errcode='55000';
  end if;
  return new;
end
$$;
create trigger enforce_variant_immutability before update or delete on public.property_media_variants
for each row execute function private.enforce_variant_immutability();

create function private.reject_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end
$$;
revoke all on function private.reject_mutation() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'property_state_history','property_slug_history','location_slug_history','property_price_history',
    'lead_conversions','customer_merge_history','customer_activities','seo_page_slug_history',
    'content_slug_history','analytics_events','audit_logs'
  ] loop
    execute format('create trigger reject_mutation before update or delete on public.%I for each row execute function private.reject_mutation()', table_name);
  end loop;
end
$$;

create function private.enforce_property_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare allowed boolean;
begin
  if new.current_state = old.current_state then return new; end if;
  allowed := case old.current_state
    when 'DRAFT' then new.current_state in ('REVIEW','ARCHIVED')
    when 'REVIEW' then new.current_state in ('DRAFT','ACTIVE','ARCHIVED')
    when 'ACTIVE' then new.current_state in ('RESERVED','SOLD','RENTED','PASSIVE')
    when 'RESERVED' then new.current_state in ('ACTIVE','SOLD','RENTED','PASSIVE')
    when 'PASSIVE' then new.current_state in ('REVIEW','ACTIVE','ARCHIVED')
    when 'SOLD' then new.current_state = 'ARCHIVED'
    when 'RENTED' then new.current_state = 'ARCHIVED'
    when 'ARCHIVED' then false
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
create trigger enforce_property_transition before update of current_state on public.properties
for each row execute function private.enforce_property_transition();

create function private.mark_property_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(old.listing_type_id,old.property_type_id,old.location_id,old.price_amount_minor,old.currency_code,old.bedroom_count,old.current_state,old.deleted_at)
     is distinct from row(new.listing_type_id,new.property_type_id,new.location_id,new.price_amount_minor,new.currency_code,new.bedroom_count,new.current_state,new.deleted_at) then
    update public.property_customer_matches set status='STALE'
      where property_id=new.id and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  end if;
  return new;
end
$$;
create trigger mark_property_matches_stale after update on public.properties
for each row execute function private.mark_property_matches_stale();

create function private.mark_request_matches_stale()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(old.status,old.listing_type_id,old.property_type_id,old.location_id,old.budget_min_minor,old.budget_max_minor,old.currency_code,old.bedrooms_min,old.bedrooms_max,old.deleted_at)
     is distinct from row(new.status,new.listing_type_id,new.property_type_id,new.location_id,new.budget_min_minor,new.budget_max_minor,new.currency_code,new.bedrooms_min,new.bedrooms_max,new.deleted_at) then
    update public.property_customer_matches set status='STALE'
      where customer_request_id=new.id and status in ('PROPOSED','REVIEWED') and deleted_at is null;
  end if;
  return new;
end
$$;
create trigger mark_request_matches_stale after update on public.customer_requests
for each row execute function private.mark_request_matches_stale();

create function private.validate_media_cover()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare property_key uuid := coalesce(new.property_id, old.property_id); active_count integer; cover_count integer;
begin
  select count(*), count(*) filter (where is_cover)
    into active_count, cover_count from public.property_media
    where property_id=property_key and deleted_at is null and state <> 'DELETED';
  if active_count > 0 and cover_count <> 1 then
    raise exception 'property % must have exactly one cover among active media', property_key using errcode='23514';
  end if;
  return null;
end
$$;
create constraint trigger validate_media_cover after insert or update or delete on public.property_media
deferrable initially deferred for each row execute function private.validate_media_cover();

create function private.validate_route_reservation(reservation_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_count integer; expected_kind text; is_history boolean; reservation public.public_route_reservations%rowtype;
begin
  if reservation_id is null then return; end if;
  select * into strict reservation from public.public_route_reservations where id=reservation_id;
  select count(*), min(kind), bool_or(history) into owner_count, expected_kind, is_history
  from (
    select 'property' kind, false history from public.properties where current_route_reservation_id=reservation_id
    union all select 'location', false from public.locations where current_route_reservation_id=reservation_id
    union all select 'seo_page', false from public.seo_pages where current_route_reservation_id=reservation_id
    union all select 'content', false from public.content_entries where current_route_reservation_id=reservation_id
    union all select 'property', true from public.property_slug_history where route_reservation_id=reservation_id
    union all select 'location', true from public.location_slug_history where route_reservation_id=reservation_id
    union all select 'seo_page', true from public.seo_page_slug_history where route_reservation_id=reservation_id
    union all select 'content', true from public.content_slug_history where route_reservation_id=reservation_id
  ) owners;
  if owner_count <> 1 or expected_kind <> reservation.route_kind then
    raise exception 'route reservation % must have exactly one matching owner', reservation_id using errcode='23514';
  end if;
  if (is_history and reservation.retired_at is null) or (not is_history and reservation.retired_at is not null) then
    raise exception 'route reservation % retirement state disagrees with its owner', reservation_id using errcode='23514';
  end if;
end
$$;

create function private.check_route_reservation_trigger()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare new_id uuid; old_id uuid;
begin
  if tg_table_name='public_route_reservations' then
    new_id := nullif(to_jsonb(new)->>'id','')::uuid;
    old_id := nullif(to_jsonb(old)->>'id','')::uuid;
  else
    new_id := nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
    old_id := nullif(to_jsonb(old)->>tg_argv[0],'')::uuid;
  end if;
  perform private.validate_route_reservation(new_id);
  if old_id is distinct from new_id then perform private.validate_route_reservation(old_id); end if;
  return null;
end
$$;

create constraint trigger route_owner_reservation after insert or update on public.public_route_reservations
deferrable initially deferred for each row execute function private.check_route_reservation_trigger();
do $$
declare table_name text;
begin
  foreach table_name in array array['properties','locations','seo_pages','content_entries'] loop
    execute format('create constraint trigger route_owner_%I after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.check_route_reservation_trigger(%L)', table_name, table_name, 'current_route_reservation_id');
  end loop;
  foreach table_name in array array['property_slug_history','location_slug_history','seo_page_slug_history','content_slug_history'] loop
    execute format('create constraint trigger route_owner_%I after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.check_route_reservation_trigger(%L)', table_name, table_name, 'route_reservation_id');
  end loop;
end
$$;
