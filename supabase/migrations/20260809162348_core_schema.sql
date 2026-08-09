-- Identity and access
create table public.user_identities (
  id uuid primary key default gen_random_uuid(), auth_provider text not null,
  provider_subject text not null, status text not null default 'active'
    check (status in ('invited','active','disabled','deleted')),
  last_sign_in_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0),
  deleted_at timestamptz, unique (auth_provider, provider_subject),
  check (btrim(auth_provider) <> '' and btrim(provider_subject) <> '')
);
create table public.advisors (
  id uuid primary key default gen_random_uuid(), user_identity_id uuid unique references public.user_identities(id) on update restrict on delete restrict,
  display_name text not null check (btrim(display_name) <> ''), status text not null check (status in ('draft','active','inactive')),
  email text, phone text, bio text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.roles (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code in ('ADMIN','ADVISOR')),
  name text not null check (btrim(name) <> ''), description text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code = lower(code) and btrim(code) <> ''),
  description text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on update restrict on delete restrict,
  permission_id uuid not null references public.permissions(id) on update restrict on delete restrict,
  granted_at timestamptz not null default now(), primary key (role_id, permission_id)
);
create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(), user_identity_id uuid not null references public.user_identities(id) on update restrict on delete restrict,
  role_id uuid not null references public.roles(id) on update restrict on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  granted_at timestamptz not null default now(), expires_at timestamptz, ended_at timestamptz,
  granted_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  ended_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  end_reason text, created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > granted_at),
  check ((status = 'ACTIVE' and ended_at is null and end_reason is null) or (status = 'ENDED' and ended_at >= granted_at and btrim(end_reason) <> ''))
);

-- Catalogs, routes, locations, and properties
create table public.listing_types (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code = upper(code) and btrim(code) <> ''), label text not null,
  description text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.property_types (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code = upper(code) and btrim(code) <> ''), label text not null,
  description text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.public_route_reservations (
  id uuid primary key default gen_random_uuid(), route_key text not null unique check (route_key ~ '^/'),
  route_kind text not null check (route_kind in ('property','location','seo_page','content')),
  created_at timestamptz not null default now(), retired_at timestamptz,
  check (retired_at is null or retired_at >= created_at)
);
create table public.locations (
  id uuid primary key default gen_random_uuid(), level text not null check (level in ('CITY','DISTRICT','NEIGHBORHOOD')),
  parent_id uuid, parent_level text, name text not null, normalized_name text not null,
  current_route_reservation_id uuid unique references public.public_route_reservations(id) on update restrict on delete restrict,
  current_slug text, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  unique (id, level), foreign key (parent_id, parent_level) references public.locations(id, level) on update restrict on delete restrict,
  check ((parent_id is null) = (parent_level is null)), check (parent_id is null or parent_id <> id),
  check ((current_route_reservation_id is null) = (current_slug is null)),
  check ((level='CITY' and parent_level is null) or (level='DISTRICT' and parent_level='CITY') or (level='NEIGHBORHOOD' and parent_level='DISTRICT'))
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), public_id text not null unique check (btrim(public_id) <> ''),
  listing_type_id uuid not null references public.listing_types(id) on update restrict on delete restrict,
  property_type_id uuid not null references public.property_types(id) on update restrict on delete restrict,
  location_id uuid not null references public.locations(id) on update restrict on delete restrict,
  current_route_reservation_id uuid unique references public.public_route_reservations(id) on update restrict on delete restrict,
  current_slug text, title text not null check (btrim(title) <> ''),
  current_state text not null check (current_state in ('DRAFT','REVIEW','ACTIVE','RESERVED','SOLD','RENTED','PASSIVE','ARCHIVED')),
  description text, price_amount_minor bigint check (price_amount_minor >= 0), currency_code text check (currency_code ~ '^[A-Z]{3}$'),
  bedroom_count smallint check (bedroom_count >= 0), bathroom_count smallint check (bathroom_count >= 0), floor_area_sqm numeric(12,2) check (floor_area_sqm >= 0),
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check ((current_route_reservation_id is null) = (current_slug is null)),
  check ((price_amount_minor is null) = (currency_code is null))
);
create table public.property_state_history (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  from_state text, to_state text not null, changed_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  intention_code text not null, reason_code text, property_version bigint not null check (property_version > 0), idempotency_key text not null unique,
  correlation_id uuid not null, reservation_reference text, reservation_advisor_id uuid references public.advisors(id) on update restrict on delete restrict,
  reservation_expires_at timestamptz, closing_amount_minor bigint check (closing_amount_minor >= 0), closing_currency_code text check (closing_currency_code ~ '^[A-Z]{3}$'),
  closing_date date, occurred_at timestamptz not null default now(), check (from_state is null or from_state <> to_state),
  check ((to_state='RESERVED' and reservation_reference is not null and reservation_advisor_id is not null and reservation_expires_at is not null)
      or (to_state<>'RESERVED' and reservation_reference is null and reservation_advisor_id is null and reservation_expires_at is null)),
  check ((to_state in ('SOLD','RENTED') and closing_amount_minor is not null and closing_currency_code is not null and closing_date is not null)
      or (to_state not in ('SOLD','RENTED') and closing_amount_minor is null and closing_currency_code is null and closing_date is null))
);
create table public.property_slug_history (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  route_reservation_id uuid not null unique references public.public_route_reservations(id) on update restrict on delete restrict,
  slug text not null, valid_from timestamptz not null, retired_at timestamptz not null, created_at timestamptz not null default now(), check (retired_at >= valid_from)
);
create table public.location_slug_history (
  id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on update restrict on delete restrict,
  route_reservation_id uuid not null unique references public.public_route_reservations(id) on update restrict on delete restrict,
  slug text not null, valid_from timestamptz not null, retired_at timestamptz not null, created_at timestamptz not null default now(), check (retired_at >= valid_from)
);
create table public.property_features (
  id uuid primary key default gen_random_uuid(), code text not null unique, label text not null, description text,
  value_kind text not null check (value_kind in ('flag','text','number')), status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
create table public.property_feature_assignments (
  property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  feature_id uuid not null references public.property_features(id) on update restrict on delete restrict,
  value_text text, value_number numeric(18,4), value_boolean boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (property_id, feature_id)
);
create table public.property_advisor_assignments (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  advisor_id uuid not null references public.advisors(id) on update restrict on delete restrict,
  assignment_role text not null, is_primary boolean not null default false, assigned_at timestamptz not null default now(), ended_at timestamptz,
  assigned_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict, end_reason text,
  check (ended_at is null or ended_at >= assigned_at), check ((ended_at is null) = (end_reason is null))
);
create table public.property_price_history (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), effective_at timestamptz not null,
  source text not null, property_version bigint not null check (property_version > 0), changed_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  reason_code text, correction_of_price_history_id uuid references public.property_price_history(id) on update restrict on delete restrict,
  idempotency_key text not null unique, created_at timestamptz not null default now(), unique (property_id, effective_at), check (correction_of_price_history_id is null or correction_of_price_history_id <> id)
);

-- Media
create table public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  initiated_by_user_identity_id uuid not null references public.user_identities(id) on update restrict on delete restrict,
  object_key text not null unique, idempotency_key uuid not null unique, expected_mime_type text not null, expected_checksum_sha256 text,
  maximum_bytes bigint not null check (maximum_bytes > 0), status text not null default 'REQUESTED' check (status in ('REQUESTED','UPLOADING','FINALIZED','EXPIRED','ABORTED')),
  expires_at timestamptz not null, finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0), check (expires_at > created_at),
  check ((status='FINALIZED') = (finalized_at is not null))
);
create table public.property_media (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  upload_session_id uuid unique references public.media_upload_sessions(id) on update restrict on delete restrict,
  state text not null check (state in ('UPLOADED','PROCESSING','READY','FAILED','DELETED')), visibility text not null check (visibility in ('PRIVATE','PUBLIC')),
  media_role text not null, source_version integer not null default 1 check (source_version > 0), sort_order integer not null check (sort_order > 0), is_cover boolean not null default false,
  original_object_key text unique, checksum_sha256 text, detected_mime_type text, width_px integer check (width_px > 0), height_px integer check (height_px > 0), byte_size bigint check (byte_size > 0),
  alt_text text, caption text, alt_text_source text, ready_at timestamptz, purged_at timestamptz,
  created_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check (visibility <> 'PUBLIC' or (state='READY' and deleted_at is null and ready_at is not null)),
  check (state not in ('READY','DELETED') or original_object_key is not null),
  check (state <> 'READY' or (checksum_sha256 is not null and detected_mime_type is not null and width_px is not null and height_px is not null and byte_size is not null))
);
create table public.property_media_variants (
  id uuid primary key default gen_random_uuid(), property_media_id uuid not null references public.property_media(id) on update restrict on delete restrict,
  source_version integer not null check (source_version > 0), recipe_version text not null, format text not null check (format in ('WEBP','AVIF')),
  width_px integer not null check (width_px > 0), height_px integer not null check (height_px > 0), byte_size bigint not null check (byte_size > 0),
  object_key text not null unique, checksum_sha256 text not null, created_at timestamptz not null default now(), purged_at timestamptz,
  unique (property_media_id, source_version, recipe_version, width_px, format)
);
create table public.media_processing_attempts (
  id uuid primary key default gen_random_uuid(), property_media_id uuid not null references public.property_media(id) on update restrict on delete restrict,
  attempt_number integer not null check (attempt_number > 0), source_version integer not null check (source_version > 0), recipe_version text not null,
  status text not null check (status in ('CLAIMED','SUCCEEDED','FAILED','REJECTED')), lease_owner text, lease_expires_at timestamptz, heartbeat_at timestamptz,
  correlation_id uuid not null, idempotency_key text not null unique, started_at timestamptz not null, finished_at timestamptz, error_code text, error_detail text,
  processor_version text not null, created_at timestamptz not null default now(), unique (property_media_id, attempt_number),
  check ((status='CLAIMED') = (lease_owner is not null and lease_expires_at is not null)), check (lease_expires_at is null or lease_expires_at > coalesce(heartbeat_at, started_at)),
  check (finished_at is null or finished_at >= started_at)
);

-- CRM
create table public.leads (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null unique, property_id uuid references public.properties(id) on update restrict on delete restrict,
  assigned_advisor_id uuid references public.advisors(id) on update restrict on delete restrict,
  status text not null check (status in ('NEW','TRIAGED','QUALIFIED','DISQUALIFIED','CONVERTED','ARCHIVED')), source text not null,
  name text, email text, phone text, message text, consent_kind text, consented_at timestamptz, idempotency_key text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check (email is not null or phone is not null), check ((consent_kind is null) = (consented_at is null))
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), display_name text not null, status text not null default 'ACTIVE' check (status in ('ACTIVE','RESTRICTED','ARCHIVED','ERASED')),
  assigned_advisor_id uuid references public.advisors(id) on update restrict on delete restrict, preferred_contact_channel text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz, erased_at timestamptz,
  check ((status='ERASED') = (erased_at is not null))
);
create table public.lead_conversions (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null unique references public.leads(id) on update restrict on delete restrict,
  customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  converted_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  outcome text not null, resolution_code text not null, converted_at timestamptz not null default now(), idempotency_key uuid not null unique,
  correlation_id uuid not null, safe_resolution_summary text
);
create table public.customer_contact_points (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  channel text not null check (channel in ('EMAIL','PHONE')), display_value text not null, normalized_value text not null, is_primary boolean not null default false,
  verification_status text not null, verified_at timestamptz, normalization_version text not null, source text not null, consent_kind text, purpose_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check ((verification_status='VERIFIED') = (verified_at is not null)), check ((consent_kind is null) = (purpose_code is null))
);
create table public.customer_merge_history (
  id uuid primary key default gen_random_uuid(), source_customer_id uuid not null unique references public.customers(id) on update restrict on delete restrict,
  survivor_customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  merged_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  reason text, correlation_id uuid, occurred_at timestamptz not null default now(), check (source_customer_id <> survivor_customer_id)
);
create table public.customer_requests (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','FULFILLED','CANCELLED','ARCHIVED')),
  listing_type_id uuid references public.listing_types(id) on update restrict on delete restrict,
  property_type_id uuid references public.property_types(id) on update restrict on delete restrict,
  location_id uuid references public.locations(id) on update restrict on delete restrict,
  budget_min_minor bigint check (budget_min_minor >= 0), budget_max_minor bigint check (budget_max_minor >= 0), currency_code text check (currency_code ~ '^[A-Z]{3}$'),
  bedrooms_min smallint check (bedrooms_min >= 0), bedrooms_max smallint check (bedrooms_max >= 0), desired_from_date date, notes text, idempotency_key uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  unique (id, customer_id), check (budget_min_minor is null or budget_max_minor is null or budget_min_minor <= budget_max_minor),
  check (bedrooms_min is null or bedrooms_max is null or bedrooms_min <= bedrooms_max),
  check ((currency_code is null and budget_min_minor is null and budget_max_minor is null) or currency_code is not null)
);
create table public.customer_request_features (
  customer_request_id uuid not null references public.customer_requests(id) on update restrict on delete restrict,
  feature_id uuid not null references public.property_features(id) on update restrict on delete restrict,
  priority text not null check (priority in ('required','preferred','avoid')), value_text text, value_number numeric(18,4), value_boolean boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (customer_request_id, feature_id)
);
create table public.customer_activities (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  customer_request_id uuid references public.customer_requests(id) on update restrict on delete restrict,
  lead_id uuid references public.leads(id) on update restrict on delete restrict, activity_type text not null, summary text,
  occurred_at timestamptz not null, created_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  source_idempotency_key text unique, created_at timestamptz not null default now()
);

-- Scheduling and matching
create table public.appointments (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  advisor_id uuid references public.advisors(id) on update restrict on delete restrict, property_id uuid references public.properties(id) on update restrict on delete restrict,
  customer_request_id uuid, starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null check (status in ('REQUESTED','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')), appointment_type text not null,
  location_note text, notes text, idempotency_key uuid unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  foreign key (customer_request_id, customer_id) references public.customer_requests(id, customer_id) on update restrict on delete restrict,
  check (ends_at > starts_at)
);
create table public.property_customer_matches (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on update restrict on delete restrict,
  customer_id uuid not null, customer_request_id uuid not null, rule_version text not null, property_version bigint not null check (property_version > 0),
  request_version bigint not null check (request_version > 0), basis_fingerprint text not null check (basis_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'PROPOSED' check (status in ('PROPOSED','REVIEWED','DISMISSED','STALE')), source text not null check (source in ('MANUAL','RULES','ASSISTED')),
  score numeric(7,6) check (score between 0 and 1), generated_at timestamptz not null, reviewed_at timestamptz,
  reviewed_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  foreign key (customer_request_id, customer_id) references public.customer_requests(id, customer_id) on update restrict on delete restrict,
  unique (property_id, customer_id, customer_request_id, rule_version, property_version, request_version, basis_fingerprint)
);
create table public.property_customer_match_reasons (
  property_customer_match_id uuid not null references public.property_customer_matches(id) on update restrict on delete restrict,
  reason_code text not null, contribution numeric(7,6) check (contribution between -1 and 1), explanation text,
  created_at timestamptz not null default now(), primary key (property_customer_match_id, reason_code)
);

-- SEO and content
create table public.seo_pages (
  id uuid primary key default gen_random_uuid(), page_kind text not null, title text not null, status text not null,
  indexability text not null check (indexability in ('INDEX','NOINDEX')),
  current_route_reservation_id uuid unique references public.public_route_reservations(id) on update restrict on delete restrict, current_slug text,
  meta_title text, meta_description text, intro_content text, published_at timestamptz, approved_at timestamptz,
  approved_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check ((current_route_reservation_id is null) = (current_slug is null))
);
create table public.seo_page_query_definitions (
  id uuid primary key default gen_random_uuid(), seo_page_id uuid not null unique references public.seo_pages(id) on update restrict on delete restrict,
  schema_version integer not null default 1 check (schema_version > 0), listing_type_id uuid references public.listing_types(id) on update restrict on delete restrict,
  property_type_id uuid references public.property_types(id) on update restrict on delete restrict, location_id uuid references public.locations(id) on update restrict on delete restrict,
  price_min_minor bigint check (price_min_minor >= 0), price_max_minor bigint check (price_max_minor >= 0), currency_code text check (currency_code ~ '^[A-Z]{3}$'),
  sort_policy text not null, normalized_fingerprint text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check (price_min_minor is null or price_max_minor is null or price_min_minor <= price_max_minor)
);
create table public.seo_page_features (
  seo_page_id uuid not null references public.seo_pages(id) on update restrict on delete restrict,
  feature_id uuid not null references public.property_features(id) on update restrict on delete restrict,
  operator text not null, value_text text, value_number numeric(18,4), value_boolean boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (seo_page_id, feature_id)
);
create table public.seo_page_slug_history (
  id uuid primary key default gen_random_uuid(), seo_page_id uuid not null references public.seo_pages(id) on update restrict on delete restrict,
  route_reservation_id uuid not null unique references public.public_route_reservations(id) on update restrict on delete restrict,
  slug text not null, valid_from timestamptz not null, retired_at timestamptz not null, created_at timestamptz not null default now(), check (retired_at >= valid_from)
);
create table public.content_entries (
  id uuid primary key default gen_random_uuid(), content_kind text not null, title text not null, status text not null,
  current_route_reservation_id uuid unique references public.public_route_reservations(id) on update restrict on delete restrict, current_slug text,
  excerpt text, body text, author_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  check ((current_route_reservation_id is null) = (current_slug is null))
);
create table public.content_slug_history (
  id uuid primary key default gen_random_uuid(), content_entry_id uuid not null references public.content_entries(id) on update restrict on delete restrict,
  route_reservation_id uuid not null unique references public.public_route_reservations(id) on update restrict on delete restrict,
  slug text not null, valid_from timestamptz not null, retired_at timestamptz not null, created_at timestamptz not null default now(), check (retired_at >= valid_from)
);

-- Analytics, audit, integration, and settings
create table public.analytics_event_definitions (
  id uuid primary key default gen_random_uuid(), event_name text not null, event_version integer not null check (event_version > 0),
  status text not null check (status in ('draft','active','deprecated')), schema_definition jsonb not null default '{}'::jsonb check (jsonb_typeof(schema_definition)='object'),
  pii_policy text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz,
  unique (event_name, event_version)
);
create table public.analytics_events (
  storage_id bigint generated always as identity primary key, event_id uuid not null unique default gen_random_uuid(),
  event_definition_id uuid not null references public.analytics_event_definitions(id) on update restrict on delete restrict,
  occurred_at timestamptz not null, received_at timestamptz not null default now(), anonymous_session_id uuid,
  user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict, correlation_id uuid, idempotency_key text unique,
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties)='object')
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  action text not null, target_type text not null, target_id uuid not null, outcome text not null check (outcome in ('succeeded','denied','failed')),
  correlation_id uuid, request_id text, change_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(change_summary)='object'),
  reason_code text, occurred_at timestamptz not null default now()
);
create table public.outbox_messages (
  id uuid primary key default gen_random_uuid(), event_name text not null, owning_domain text not null, aggregate_type text not null,
  event_version integer not null check (event_version > 0), aggregate_id uuid not null, correlation_id uuid not null, idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'), status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PROCESSED','DEAD_LETTER')),
  attempt_count integer not null default 0 check (attempt_count >= 0), next_attempt_at timestamptz not null default now(), lease_owner text, lease_expires_at timestamptz,
  last_attempt_at timestamptz, processed_at timestamptz, dead_lettered_at timestamptz, last_error_code text, created_at timestamptz not null default now(),
  check ((lease_owner is null) = (lease_expires_at is null)),
  check ((status='PROCESSING') = (lease_owner is not null)),
  check ((status='PROCESSED') = (processed_at is not null)),
  check ((status='DEAD_LETTER') = (dead_lettered_at is not null)),
  check (processed_at is null or dead_lettered_at is null)
);
create table public.site_settings (
  id uuid primary key default gen_random_uuid(), setting_key text not null, setting_value jsonb not null check (jsonb_typeof(setting_value)='object'),
  schema_version integer not null default 1 check (schema_version > 0), status text not null default 'active' check (status in ('active','inactive')),
  description text, updated_by_user_identity_id uuid references public.user_identities(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1 check (version > 0), deleted_at timestamptz
);
