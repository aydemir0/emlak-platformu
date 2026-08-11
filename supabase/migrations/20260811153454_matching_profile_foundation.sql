alter table public.customer_requests
  add column net_area_min bigint,
  add column net_area_max bigint,
  add column matching_location_state text not null default 'MISSING',
  add column matching_budget_state text not null default 'MISSING',
  add column matching_property_type_state text not null default 'MISSING',
  add column matching_rooms_state text not null default 'MISSING',
  add column matching_net_area_state text not null default 'MISSING',
  add column matching_features_state text not null default 'MISSING',
  add constraint customer_requests_matching_location_state_check check (matching_location_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_matching_budget_state_check check (matching_budget_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_matching_property_type_state_check check (matching_property_type_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_matching_rooms_state_check check (matching_rooms_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_matching_net_area_state_check check (matching_net_area_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_matching_features_state_check check (matching_features_state in ('MISSING','FLEXIBLE','CONSTRAINED')),
  add constraint customer_requests_net_area_range_check check (
    net_area_min is null or net_area_min >= 0
  ),
  add constraint customer_requests_net_area_max_check check (
    net_area_max is null or net_area_max >= 0
  ),
  add constraint customer_requests_matching_net_area_state_range_check check (
    (matching_net_area_state <> 'CONSTRAINED' and (net_area_min is null or net_area_max is null or net_area_min <= net_area_max))
    or (matching_net_area_state = 'CONSTRAINED' and (net_area_min is not null or net_area_max is not null) and (net_area_min is null or net_area_max is null or net_area_min <= net_area_max))
  );
