-- Stable active/current uniqueness.
create unique index user_role_assignments_one_active
  on public.user_role_assignments (user_identity_id, role_id) where status = 'ACTIVE';
create unique index locations_active_sibling_name
  on public.locations (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), level, normalized_name)
  where deleted_at is null;
create unique index property_advisor_assignments_active_role
  on public.property_advisor_assignments (property_id, advisor_id, assignment_role) where ended_at is null;
create unique index property_advisor_assignments_one_primary
  on public.property_advisor_assignments (property_id) where ended_at is null and is_primary;
create unique index property_media_active_order
  on public.property_media (property_id, sort_order) where deleted_at is null and state <> 'DELETED';
create unique index property_media_one_cover
  on public.property_media (property_id) where deleted_at is null and state <> 'DELETED' and is_cover;
create unique index customer_contact_points_one_primary
  on public.customer_contact_points (customer_id, channel) where deleted_at is null and is_primary;
create unique index property_customer_matches_one_current
  on public.property_customer_matches (property_id, customer_id, customer_request_id)
  where deleted_at is null and status in ('PROPOSED','REVIEWED');
create unique index site_settings_one_active
  on public.site_settings (setting_key) where deleted_at is null and status = 'active';

-- V1 same-advisor half-open appointment overlap prohibition.
alter table public.appointments add constraint appointments_no_advisor_overlap
  exclude using gist (
    advisor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (advisor_id is not null and status <> 'CANCELLED' and deleted_at is null);

-- Public property URLs are permanently reserved in the approved canonical taxonomy.
alter table public.public_route_reservations add constraint public_route_property_taxonomy
  check (route_kind <> 'property' or route_key ~ '^/(satilik|kiralik)/[^/]+/[^/]+/[^/]+/[^/]+$');

-- Relationship and dominant-query indexes. Every non-PK FK gets an index unless
-- an existing unique/compound index already has the FK as its left prefix.
create index advisors_user_identity_idx on public.advisors(user_identity_id);
create index role_permissions_permission_idx on public.role_permissions(permission_id);
create index user_role_assignments_user_idx on public.user_role_assignments(user_identity_id, status);
create index user_role_assignments_role_idx on public.user_role_assignments(role_id);
create index user_role_assignments_granted_by_idx on public.user_role_assignments(granted_by_user_identity_id);
create index user_role_assignments_ended_by_idx on public.user_role_assignments(ended_by_user_identity_id);
create index locations_parent_idx on public.locations(parent_id);
create index locations_parent_key_idx on public.locations(parent_id, parent_level);
create index properties_listing_type_idx on public.properties(listing_type_id);
create index properties_property_type_idx on public.properties(property_type_id);
create index properties_location_idx on public.properties(location_id);
create index properties_discovery_idx on public.properties(current_state, listing_type_id, location_id, property_type_id) where deleted_at is null;
create index property_state_history_property_idx on public.property_state_history(property_id, occurred_at desc);
create index property_state_history_actor_idx on public.property_state_history(changed_by_user_identity_id);
create index property_state_history_reservation_advisor_idx on public.property_state_history(reservation_advisor_id);
create index property_slug_history_property_idx on public.property_slug_history(property_id, retired_at desc);
create index location_slug_history_location_idx on public.location_slug_history(location_id, retired_at desc);
create index property_feature_assignments_feature_idx on public.property_feature_assignments(feature_id);
create index property_advisor_assignments_advisor_idx on public.property_advisor_assignments(advisor_id, ended_at);
create index property_advisor_assignments_actor_idx on public.property_advisor_assignments(assigned_by_user_identity_id);
create index property_price_history_property_idx on public.property_price_history(property_id, effective_at desc);
create index property_price_history_actor_idx on public.property_price_history(changed_by_user_identity_id);
create index property_price_history_correction_idx on public.property_price_history(correction_of_price_history_id);
create index media_upload_sessions_property_idx on public.media_upload_sessions(property_id);
create index media_upload_sessions_actor_idx on public.media_upload_sessions(initiated_by_user_identity_id);
create index property_media_property_idx on public.property_media(property_id, sort_order) where deleted_at is null;
create index property_media_actor_idx on public.property_media(created_by_user_identity_id);
create index property_media_variants_media_idx on public.property_media_variants(property_media_id, source_version);
create index media_processing_attempts_claim_idx on public.media_processing_attempts(status, lease_expires_at) where status='CLAIMED';
create index leads_property_idx on public.leads(property_id);
create index leads_advisor_idx on public.leads(assigned_advisor_id, status) where deleted_at is null;
create index lead_conversions_customer_idx on public.lead_conversions(customer_id, converted_at desc);
create index lead_conversions_actor_idx on public.lead_conversions(converted_by_user_identity_id);
create index customers_advisor_idx on public.customers(assigned_advisor_id) where deleted_at is null;
create index customer_contact_points_customer_idx on public.customer_contact_points(customer_id);
create index customer_contact_points_normalized_idx on public.customer_contact_points(channel, normalized_value) where deleted_at is null;
create index customer_merge_history_survivor_idx on public.customer_merge_history(survivor_customer_id);
create index customer_merge_history_actor_idx on public.customer_merge_history(merged_by_user_identity_id);
create index customer_requests_customer_idx on public.customer_requests(customer_id, status) where deleted_at is null;
create index customer_requests_listing_type_idx on public.customer_requests(listing_type_id);
create index customer_requests_property_type_idx on public.customer_requests(property_type_id);
create index customer_requests_location_idx on public.customer_requests(location_id);
create index customer_requests_matching_idx on public.customer_requests(status, listing_type_id, location_id, property_type_id) where deleted_at is null;
create index customer_request_features_feature_idx on public.customer_request_features(feature_id);
create index customer_activities_customer_idx on public.customer_activities(customer_id, occurred_at desc);
create index customer_activities_request_idx on public.customer_activities(customer_request_id, occurred_at desc);
create index customer_activities_lead_idx on public.customer_activities(lead_id, occurred_at desc);
create index customer_activities_actor_idx on public.customer_activities(created_by_user_identity_id);
create index appointments_advisor_idx on public.appointments(advisor_id, starts_at) where deleted_at is null;
create index appointments_customer_idx on public.appointments(customer_id, starts_at);
create index appointments_property_idx on public.appointments(property_id, starts_at);
create index appointments_request_idx on public.appointments(customer_request_id, starts_at);
create index appointments_request_customer_idx on public.appointments(customer_request_id, customer_id);
create index property_customer_matches_request_idx on public.property_customer_matches(customer_request_id, status, score desc);
create index property_customer_matches_property_idx on public.property_customer_matches(property_id, status);
create index property_customer_matches_request_customer_idx on public.property_customer_matches(customer_request_id, customer_id);
create index property_customer_matches_reviewer_idx on public.property_customer_matches(reviewed_by_user_identity_id);
create index property_customer_match_reasons_reason_idx on public.property_customer_match_reasons(reason_code);
create index seo_page_query_listing_idx on public.seo_page_query_definitions(listing_type_id);
create index seo_page_query_property_type_idx on public.seo_page_query_definitions(property_type_id);
create index seo_page_query_location_idx on public.seo_page_query_definitions(location_id);
create index seo_pages_approver_idx on public.seo_pages(approved_by_user_identity_id);
create index seo_page_features_feature_idx on public.seo_page_features(feature_id);
create index seo_page_slug_history_page_idx on public.seo_page_slug_history(seo_page_id, retired_at desc);
create index content_entries_author_idx on public.content_entries(author_user_identity_id);
create index content_slug_history_entry_idx on public.content_slug_history(content_entry_id, retired_at desc);
create index analytics_events_definition_idx on public.analytics_events(event_definition_id, occurred_at desc);
create index analytics_events_occurred_idx on public.analytics_events(occurred_at);
create index analytics_events_user_idx on public.analytics_events(user_identity_id, occurred_at desc);
create index audit_logs_target_idx on public.audit_logs(target_type, target_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_user_identity_id, occurred_at desc);
create index audit_logs_correlation_idx on public.audit_logs(correlation_id) where correlation_id is not null;
create index outbox_messages_claim_idx on public.outbox_messages(status, next_attempt_at, created_at) where status='PENDING';
create index outbox_messages_lease_idx on public.outbox_messages(lease_expires_at) where status='PROCESSING';
create index outbox_messages_aggregate_idx on public.outbox_messages(aggregate_type, aggregate_id, created_at desc);
create index site_settings_actor_idx on public.site_settings(updated_by_user_identity_id);
