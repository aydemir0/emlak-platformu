# Entity relationship diagrams

## Scope

These Mermaid diagrams cover all 45 tables. The overview shows ownership/dependency direction; bounded-context diagrams show table cardinalities. Logical references from analytics, audit, and outbox payloads are intentionally not polymorphic foreign keys. See [Relationships](relationships.md) for delete/restore rules, [Schema draft](schema-draft.md) for columns, [Entity catalog](entity-catalog.md) for lifecycle/security, and [Domain model](domain-model.md) for invariants.

## Cross-domain overview

```mermaid
flowchart LR
  IA["Identity and access\n6 tables"] --> PR["Properties, catalogs, locations\n12 tables"]
  IA --> CRM["Leads and customers\n8 tables"]
  PR --> MED["Property media\n4 tables"]
  PR --> CRM
  PR --> AM["Appointments and matching\n3 tables"]
  CRM --> AM
  PR --> SEO["SEO, content, URL namespace\n8 tables"]
  IA --> SEO
  IA --> OPS["Analytics, audit, outbox, settings\n4 tables"]
  PR --> OPS
  MED --> OPS
  CRM --> OPS
  AM --> OPS
  SEO --> OPS
```

The overview counts `public_route_reservations` in SEO/content and counts location slug history with the property/location context, totaling 45.

## Identity and access

```mermaid
erDiagram
  user_identities ||--o| advisors : "profile"
  user_identities ||--o{ user_role_assignments : "receives"
  roles ||--o{ user_role_assignments : "grants"
  roles ||--o{ role_permissions : "bundles"
  permissions ||--o{ role_permissions : "included in"

  user_identities {
    uuid id PK
    text auth_provider
    text provider_subject
    text status
  }
  advisors {
    uuid id PK
    uuid user_identity_id FK
    text status
  }
  roles {
    uuid id PK
    text code UK
  }
  permissions {
    uuid id PK
    text code UK
  }
  role_permissions {
    uuid role_id PK,FK
    uuid permission_id PK,FK
  }
  user_role_assignments {
    uuid id PK
    uuid user_identity_id FK
    uuid role_id FK
    text status
    timestamptz ended_at
  }
```

## Properties, catalogs, locations, and routes

```mermaid
erDiagram
  listing_types ||--o{ properties : "classifies"
  property_types ||--o{ properties : "classifies"
  heating_types ||--o{ properties : "heats"
  locations o|--o{ locations : "parent of"
  locations ||--o{ properties : "contains"
  properties ||--o{ property_state_history : "records"
  properties ||--o{ property_slug_history : "retired routes"
  properties ||--o{ property_feature_assignments : "has"
  property_features ||--o{ property_feature_assignments : "assigned"
  properties ||--o{ property_advisor_assignments : "assigned"
  advisors ||--o{ property_advisor_assignments : "serves"
  properties ||--o{ property_price_history : "prices"
  locations ||--o{ location_slug_history : "retired routes"
  public_route_reservations ||--o| property_slug_history : "reserves old route"
  public_route_reservations ||--o| location_slug_history : "reserves old route"
  public_route_reservations o|--o| properties : "current route"
  public_route_reservations o|--o| locations : "current route"

  listing_types {
    uuid id PK
    text code UK
  }
  property_types {
    uuid id PK
    text code UK
  }
  heating_types {
    uuid id PK
    text code UK
    text status
  }
  properties {
    uuid id PK
    text public_id UK
    uuid listing_type_id FK
    uuid property_type_id FK
    uuid heating_type_id FK
    uuid location_id FK
    uuid current_route_reservation_id FK
    text current_slug
    text current_state
  }
  property_state_history {
    uuid id PK
    uuid property_id FK
    text to_state
  }
  property_slug_history {
    uuid id PK
    uuid property_id FK
    uuid route_reservation_id FK
    text slug
  }
  locations {
    uuid id PK
    text level
    uuid parent_id FK
    text parent_level FK
    uuid current_route_reservation_id FK
    text current_slug
  }
  location_slug_history {
    uuid id PK
    uuid location_id FK
    uuid route_reservation_id FK
    text slug
  }
  property_features {
    uuid id PK
    text code UK
    text value_kind
  }
  property_feature_assignments {
    uuid property_id PK,FK
    uuid feature_id PK,FK
  }
  property_advisor_assignments {
    uuid id PK
    uuid property_id FK
    uuid advisor_id FK
  }
  property_price_history {
    uuid id PK
    uuid property_id FK
    bigint amount_minor
    text currency_code
  }
  public_route_reservations {
    uuid id PK
    text route_key UK
    text route_kind
    timestamptz retired_at
  }
```

## Property media

```mermaid
erDiagram
  properties ||--o{ media_upload_sessions : "authorizes for"
  user_identities ||--o{ media_upload_sessions : "initiates"
  properties ||--o{ property_media : "has"
  media_upload_sessions o|--o| property_media : "finalizes as"
  property_media ||--o{ property_media_variants : "generates"
  property_media ||--o{ media_processing_attempts : "attempted by"

  media_upload_sessions {
    uuid id PK
    uuid property_id FK
    uuid initiated_by_user_identity_id FK
    text object_key UK
    text status
  }
  property_media {
    uuid id PK
    uuid property_id FK
    uuid upload_session_id FK
    text state
    integer source_version
  }
  property_media_variants {
    uuid id PK
    uuid property_media_id FK
    text recipe_version
    text object_key UK
  }
  media_processing_attempts {
    uuid id PK
    uuid property_media_id FK
    integer attempt_number
    text status
  }
```

## Leads and customers

```mermaid
erDiagram
  properties o|--o{ leads : "interest in"
  advisors o|--o{ leads : "assigned"
  advisors o|--o{ customers : "assigned"
  leads ||--o| lead_conversions : "converted by"
  customers ||--o{ lead_conversions : "created or linked"
  customers ||--o{ customer_contact_points : "has"
  customers ||--o{ customer_requests : "makes"
  customers ||--o{ customer_activities : "timeline"
  leads o|--o{ customer_activities : "context"
  customer_requests o|--o{ customer_activities : "context"
  customers ||--o{ customer_merge_history : "source"
  customers ||--o{ customer_merge_history : "survivor"
  customer_requests ||--o{ customer_request_features : "requires"
  property_features ||--o{ customer_request_features : "desired"

  leads {
    uuid id PK
    uuid property_id FK
    uuid assigned_advisor_id FK
    text status
  }
  lead_conversions {
    uuid id PK
    uuid lead_id FK
    uuid customer_id FK
  }
  customers {
    uuid id PK
    uuid assigned_advisor_id FK
    text status
    text display_name
  }
  customer_contact_points {
    uuid id PK
    uuid customer_id FK
    text channel
    text normalized_value
  }
  customer_merge_history {
    uuid id PK
    uuid source_customer_id FK
    uuid survivor_customer_id FK
  }
  customer_requests {
    uuid id PK
    uuid customer_id FK
    text status
  }
  customer_request_features {
    uuid customer_request_id PK,FK
    uuid feature_id PK,FK
  }
  customer_activities {
    uuid id PK
    uuid customer_id FK
    uuid customer_request_id FK
    uuid lead_id FK
  }
```

## Appointments and matching

```mermaid
erDiagram
  customers ||--o{ appointments : "attends"
  advisors o|--o{ appointments : "hosts"
  properties o|--o{ appointments : "visits"
  customer_requests o|--o{ appointments : "fulfills"
  properties ||--o{ property_customer_matches : "candidate"
  customers ||--o{ property_customer_matches : "matched for"
  customer_requests ||--o{ property_customer_matches : "receives"
  property_customer_matches ||--o{ property_customer_match_reasons : "explained by"

  appointments {
    uuid id PK
    uuid customer_id FK
    uuid advisor_id FK
    uuid property_id FK
    uuid customer_request_id FK
    timestamptz starts_at
    timestamptz ends_at
  }
  property_customer_matches {
    uuid id PK
    uuid property_id FK
    uuid customer_id FK
    uuid customer_request_id FK
    text rule_version
    bigint property_version
    bigint request_version
    text basis_fingerprint
    numeric score
  }
  property_customer_match_reasons {
    uuid property_customer_match_id PK,FK
    text reason_code PK
  }
```

## SEO, content, and URL namespace

```mermaid
erDiagram
  seo_pages ||--o| seo_page_query_definitions : "defines"
  seo_pages ||--o{ seo_page_features : "constrains"
  property_features ||--o{ seo_page_features : "facet"
  seo_pages ||--o{ seo_page_slug_history : "retired routes"
  content_entries ||--o{ content_slug_history : "retired routes"
  public_route_reservations ||--o| seo_page_slug_history : "reserves old route"
  public_route_reservations ||--o| content_slug_history : "reserves old route"
  public_route_reservations o|--o| seo_pages : "current route"
  public_route_reservations o|--o| content_entries : "current route"

  seo_pages {
    uuid id PK
    uuid current_route_reservation_id FK
    text current_slug
    text status
    text indexability
  }
  seo_page_query_definitions {
    uuid id PK
    uuid seo_page_id FK
    uuid listing_type_id FK
    uuid property_type_id FK
    uuid location_id FK
  }
  seo_page_features {
    uuid seo_page_id PK,FK
    uuid feature_id PK,FK
    text operator
  }
  seo_page_slug_history {
    uuid id PK
    uuid seo_page_id FK
    uuid route_reservation_id FK
    text slug
  }
  content_entries {
    uuid id PK
    uuid current_route_reservation_id FK
    text current_slug
    text status
  }
  content_slug_history {
    uuid id PK
    uuid content_entry_id FK
    uuid route_reservation_id FK
    text slug
  }
  public_route_reservations {
    uuid id PK
    text route_key UK
    text route_kind
  }
```

## Analytics, audit, integration, and settings

```mermaid
erDiagram
  analytics_event_definitions ||--o{ analytics_events : "validates"
  user_identities o|--o{ analytics_events : "optional actor"
  user_identities o|--o{ audit_logs : "actor"
  user_identities o|--o{ site_settings : "last editor"

  analytics_event_definitions {
    uuid id PK
    text event_name
    integer event_version
  }
  analytics_events {
    bigint storage_id PK
    uuid event_id UK
    uuid event_definition_id FK
    timestamptz occurred_at
  }
  audit_logs {
    uuid id PK
    uuid actor_user_identity_id FK
    text target_type
    uuid target_id
  }
  outbox_messages {
    uuid id PK
    text event_name
    text aggregate_type
    uuid aggregate_id
    text idempotency_key UK
    text status
  }
  site_settings {
    uuid id PK
    text setting_key
    uuid updated_by_user_identity_id FK
  }
```

`audit_logs.target_type/target_id`, `outbox_messages.aggregate_type/aggregate_id`, and any analytics entity reference are logical, typed references without polymorphic FKs. Their owners validate target existence/authorization when writing or replaying; they cannot create circular aggregate ownership.
