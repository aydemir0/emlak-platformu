import type { Database } from "@/types/database.generated";

type ExpectedTableNames =
  | "advisors"
  | "analytics_event_definitions"
  | "analytics_events"
  | "appointments"
  | "audit_logs"
  | "content_entries"
  | "content_slug_history"
  | "customer_activities"
  | "customer_contact_points"
  | "customer_merge_history"
  | "customer_request_features"
  | "customer_requests"
  | "customers"
  | "heating_types"
  | "lead_conversions"
  | "leads"
  | "listing_types"
  | "location_slug_history"
  | "locations"
  | "media_processing_attempts"
  | "media_upload_sessions"
  | "outbox_messages"
  | "permissions"
  | "properties"
  | "property_advisor_assignments"
  | "property_customer_match_reasons"
  | "property_customer_matches"
  | "property_feature_assignments"
  | "property_features"
  | "property_media"
  | "property_media_variants"
  | "property_price_history"
  | "property_slug_history"
  | "property_state_history"
  | "property_types"
  | "public_route_reservations"
  | "role_permissions"
  | "roles"
  | "seo_page_features"
  | "seo_page_query_definitions"
  | "seo_page_slug_history"
  | "seo_pages"
  | "site_settings"
  | "user_identities"
  | "user_role_assignments";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

export type DatabaseTablesMatchPhaseFive = Assert<
  Equal<keyof Database["public"]["Tables"], ExpectedTableNames>
>;
