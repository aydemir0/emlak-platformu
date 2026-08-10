export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      advisors: {
        Row: {
          bio: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          email: string | null
          id: string
          phone: string | null
          status: string
          updated_at: string
          user_identity_id: string | null
          version: number
        }
        Insert: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          status: string
          updated_at?: string
          user_identity_id?: string | null
          version?: number
        }
        Update: {
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_identity_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "advisors_user_identity_id_fkey"
            columns: ["user_identity_id"]
            isOneToOne: true
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_event_definitions: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_name: string
          event_version: number
          id: string
          pii_policy: string
          schema_definition: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_name: string
          event_version: number
          id?: string
          pii_policy: string
          schema_definition?: Json
          status: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_name?: string
          event_version?: number
          id?: string
          pii_policy?: string
          schema_definition?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          anonymous_session_id: string | null
          correlation_id: string | null
          event_definition_id: string
          event_id: string
          idempotency_key: string | null
          occurred_at: string
          properties: Json
          received_at: string
          storage_id: number
          user_identity_id: string | null
        }
        Insert: {
          anonymous_session_id?: string | null
          correlation_id?: string | null
          event_definition_id: string
          event_id?: string
          idempotency_key?: string | null
          occurred_at: string
          properties?: Json
          received_at?: string
          storage_id?: never
          user_identity_id?: string | null
        }
        Update: {
          anonymous_session_id?: string | null
          correlation_id?: string | null
          event_definition_id?: string
          event_id?: string
          idempotency_key?: string | null
          occurred_at?: string
          properties?: Json
          received_at?: string
          storage_id?: never
          user_identity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_event_definition_id_fkey"
            columns: ["event_definition_id"]
            isOneToOne: false
            referencedRelation: "analytics_event_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_identity_id_fkey"
            columns: ["user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          advisor_id: string | null
          appointment_type: string
          created_at: string
          customer_id: string
          customer_request_id: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          idempotency_key: string | null
          location_note: string | null
          notes: string | null
          property_id: string | null
          starts_at: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          advisor_id?: string | null
          appointment_type: string
          created_at?: string
          customer_id: string
          customer_request_id?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          idempotency_key?: string | null
          location_note?: string | null
          notes?: string | null
          property_id?: string | null
          starts_at: string
          status: string
          updated_at?: string
          version?: number
        }
        Update: {
          advisor_id?: string | null
          appointment_type?: string
          created_at?: string
          customer_id?: string
          customer_request_id?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          idempotency_key?: string | null
          location_note?: string | null
          notes?: string | null
          property_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointments_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "advisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_request_id_customer_id_fkey"
            columns: ["customer_request_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "appointments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_identity_id: string | null
          change_summary: Json
          correlation_id: string | null
          id: string
          occurred_at: string
          outcome: string
          reason_code: string | null
          request_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_user_identity_id?: string | null
          change_summary?: Json
          correlation_id?: string | null
          id?: string
          occurred_at?: string
          outcome: string
          reason_code?: string | null
          request_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_user_identity_id?: string | null
          change_summary?: Json
          correlation_id?: string | null
          id?: string
          occurred_at?: string
          outcome?: string
          reason_code?: string | null
          request_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_identity_id_fkey"
            columns: ["actor_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      content_entries: {
        Row: {
          author_user_identity_id: string | null
          body: string | null
          content_kind: string
          created_at: string
          current_route_reservation_id: string | null
          current_slug: string | null
          deleted_at: string | null
          excerpt: string | null
          id: string
          published_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          author_user_identity_id?: string | null
          body?: string | null
          content_kind: string
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          status: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          author_user_identity_id?: string | null
          body?: string | null
          content_kind?: string
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_entries_author_user_identity_id_fkey"
            columns: ["author_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_entries_current_route_reservation_id_fkey"
            columns: ["current_route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_slug_history: {
        Row: {
          content_entry_id: string
          created_at: string
          id: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Insert: {
          content_entry_id: string
          created_at?: string
          id?: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Update: {
          content_entry_id?: string
          created_at?: string
          id?: string
          retired_at?: string
          route_reservation_id?: string
          slug?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_slug_history_content_entry_id_fkey"
            columns: ["content_entry_id"]
            isOneToOne: false
            referencedRelation: "content_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_slug_history_route_reservation_id_fkey"
            columns: ["route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activities: {
        Row: {
          activity_type: string
          created_at: string
          created_by_user_identity_id: string | null
          customer_id: string
          customer_request_id: string | null
          id: string
          lead_id: string | null
          occurred_at: string
          source_idempotency_key: string | null
          summary: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          created_by_user_identity_id?: string | null
          customer_id: string
          customer_request_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at: string
          source_idempotency_key?: string | null
          summary?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by_user_identity_id?: string | null
          customer_id?: string
          customer_request_id?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          source_idempotency_key?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_activities_created_by_user_identity_id_fkey"
            columns: ["created_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_request_id_fkey"
            columns: ["customer_request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact_points: {
        Row: {
          channel: string
          consent_kind: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          display_value: string
          id: string
          is_primary: boolean
          normalization_version: string
          normalized_value: string
          purpose_code: string | null
          source: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          version: number
        }
        Insert: {
          channel: string
          consent_kind?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          display_value: string
          id?: string
          is_primary?: boolean
          normalization_version: string
          normalized_value: string
          purpose_code?: string | null
          source: string
          updated_at?: string
          verification_status: string
          verified_at?: string | null
          version?: number
        }
        Update: {
          channel?: string
          consent_kind?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          display_value?: string
          id?: string
          is_primary?: boolean
          normalization_version?: string
          normalized_value?: string
          purpose_code?: string | null
          source?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_merge_history: {
        Row: {
          correlation_id: string | null
          id: string
          merged_by_user_identity_id: string | null
          occurred_at: string
          reason: string | null
          source_customer_id: string
          survivor_customer_id: string
        }
        Insert: {
          correlation_id?: string | null
          id?: string
          merged_by_user_identity_id?: string | null
          occurred_at?: string
          reason?: string | null
          source_customer_id: string
          survivor_customer_id: string
        }
        Update: {
          correlation_id?: string | null
          id?: string
          merged_by_user_identity_id?: string | null
          occurred_at?: string
          reason?: string | null
          source_customer_id?: string
          survivor_customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_merge_history_merged_by_user_identity_id_fkey"
            columns: ["merged_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_history_source_customer_id_fkey"
            columns: ["source_customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_history_survivor_customer_id_fkey"
            columns: ["survivor_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_request_features: {
        Row: {
          created_at: string
          customer_request_id: string
          feature_id: string
          priority: string
          updated_at: string
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          customer_request_id: string
          feature_id: string
          priority: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          customer_request_id?: string
          feature_id?: string
          priority?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_request_features_customer_request_id_fkey"
            columns: ["customer_request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_request_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "property_features"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_requests: {
        Row: {
          bedrooms_max: number | null
          bedrooms_min: number | null
          budget_max_minor: number | null
          budget_min_minor: number | null
          created_at: string
          currency_code: string | null
          customer_id: string
          deleted_at: string | null
          desired_from_date: string | null
          id: string
          idempotency_key: string | null
          listing_type_id: string | null
          location_id: string | null
          notes: string | null
          property_type_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          budget_max_minor?: number | null
          budget_min_minor?: number | null
          created_at?: string
          currency_code?: string | null
          customer_id: string
          deleted_at?: string | null
          desired_from_date?: string | null
          id?: string
          idempotency_key?: string | null
          listing_type_id?: string | null
          location_id?: string | null
          notes?: string | null
          property_type_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          budget_max_minor?: number | null
          budget_min_minor?: number | null
          created_at?: string
          currency_code?: string | null
          customer_id?: string
          deleted_at?: string | null
          desired_from_date?: string | null
          id?: string
          idempotency_key?: string | null
          listing_type_id?: string | null
          location_id?: string | null
          notes?: string | null
          property_type_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_listing_type_id_fkey"
            columns: ["listing_type_id"]
            isOneToOne: false
            referencedRelation: "listing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          assigned_advisor_id: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          erased_at: string | null
          id: string
          preferred_contact_channel: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          assigned_advisor_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          erased_at?: string | null
          id?: string
          preferred_contact_channel?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_advisor_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          erased_at?: string | null
          id?: string
          preferred_contact_channel?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_advisor_id_fkey"
            columns: ["assigned_advisor_id"]
            isOneToOne: false
            referencedRelation: "advisors"
            referencedColumns: ["id"]
          },
        ]
      }
      heating_types: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          label: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      lead_conversions: {
        Row: {
          converted_at: string
          converted_by_user_identity_id: string | null
          correlation_id: string
          customer_id: string
          id: string
          idempotency_key: string
          lead_id: string
          outcome: string
          resolution_code: string
          safe_resolution_summary: string | null
        }
        Insert: {
          converted_at?: string
          converted_by_user_identity_id?: string | null
          correlation_id: string
          customer_id: string
          id?: string
          idempotency_key: string
          lead_id: string
          outcome: string
          resolution_code: string
          safe_resolution_summary?: string | null
        }
        Update: {
          converted_at?: string
          converted_by_user_identity_id?: string | null
          correlation_id?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          lead_id?: string
          outcome?: string
          resolution_code?: string
          safe_resolution_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_conversions_converted_by_user_identity_id_fkey"
            columns: ["converted_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_conversions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_conversions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: { activity_type: string; correlation_id: string; created_at: string; created_by_user_identity_id: string | null; details: Json; id: string; lead_id: string; occurred_at: string; source_idempotency_key: string | null; summary: string | null }
        Insert: { activity_type: string; correlation_id: string; created_at?: string; created_by_user_identity_id?: string | null; details?: Json; id?: string; lead_id: string; occurred_at: string; source_idempotency_key?: string | null; summary?: string | null }
        Update: { activity_type?: string; correlation_id?: string; created_at?: string; created_by_user_identity_id?: string | null; details?: Json; id?: string; lead_id?: string; occurred_at?: string; source_idempotency_key?: string | null; summary?: string | null }
        Relationships: [
          { foreignKeyName: "lead_activities_created_by_user_identity_id_fkey"; columns: ["created_by_user_identity_id"]; isOneToOne: false; referencedRelation: "user_identities"; referencedColumns: ["id"] },
          { foreignKeyName: "lead_activities_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] },
        ]
      }
      lead_assignment_history: {
        Row: { assigned_by_user_identity_id: string | null; correlation_id: string; from_advisor_id: string | null; id: string; lead_id: string; occurred_at: string; reason_code: string | null; source_idempotency_key: string | null; to_advisor_id: string | null }
        Insert: { assigned_by_user_identity_id?: string | null; correlation_id: string; from_advisor_id?: string | null; id?: string; lead_id: string; occurred_at?: string; reason_code?: string | null; source_idempotency_key?: string | null; to_advisor_id?: string | null }
        Update: { assigned_by_user_identity_id?: string | null; correlation_id?: string; from_advisor_id?: string | null; id?: string; lead_id?: string; occurred_at?: string; reason_code?: string | null; source_idempotency_key?: string | null; to_advisor_id?: string | null }
        Relationships: [
          { foreignKeyName: "lead_assignment_history_assigned_by_user_identity_id_fkey"; columns: ["assigned_by_user_identity_id"]; isOneToOne: false; referencedRelation: "user_identities"; referencedColumns: ["id"] },
          { foreignKeyName: "lead_assignment_history_from_advisor_id_fkey"; columns: ["from_advisor_id"]; isOneToOne: false; referencedRelation: "advisors"; referencedColumns: ["id"] },
          { foreignKeyName: "lead_assignment_history_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] },
          { foreignKeyName: "lead_assignment_history_to_advisor_id_fkey"; columns: ["to_advisor_id"]; isOneToOne: false; referencedRelation: "advisors"; referencedColumns: ["id"] },
        ]
      }
      lead_contact_intakes: {
        Row: { channel: string; created_at: string; id: string; lead_id: string; normalization_algorithm: string; normalization_version: string; normalized_value: string | null; raw_value: string; source: string }
        Insert: { channel: string; created_at?: string; id?: string; lead_id: string; normalization_algorithm: string; normalization_version: string; normalized_value?: string | null; raw_value: string; source: string }
        Update: { channel?: string; created_at?: string; id?: string; lead_id?: string; normalization_algorithm?: string; normalization_version?: string; normalized_value?: string | null; raw_value?: string; source?: string }
        Relationships: [{ foreignKeyName: "lead_contact_intakes_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] }]
      }
      leads: {
        Row: {
          abuse_network_signal: string | null
          assigned_advisor_id: string | null
          consent_kind: string | null
          consented_at: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          idempotency_fingerprint: string | null
          idempotency_key: string | null
          message: string | null
          name: string | null
          phone: string | null
          property_id: string | null
          source: string
          status: string
          submission_id: string
          updated_at: string
          version: number
        }
        Insert: {
          abuse_network_signal?: string | null
          assigned_advisor_id?: string | null
          consent_kind?: string | null
          consented_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          message?: string | null
          name?: string | null
          phone?: string | null
          property_id?: string | null
          source: string
          status: string
          submission_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          abuse_network_signal?: string | null
          assigned_advisor_id?: string | null
          consent_kind?: string | null
          consented_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          idempotency_fingerprint?: string | null
          idempotency_key?: string | null
          message?: string | null
          name?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string
          status?: string
          submission_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_advisor_id_fkey"
            columns: ["assigned_advisor_id"]
            isOneToOne: false
            referencedRelation: "advisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_types: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          label: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      location_slug_history: {
        Row: {
          created_at: string
          id: string
          location_id: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          retired_at?: string
          route_reservation_id?: string
          slug?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_slug_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_slug_history_route_reservation_id_fkey"
            columns: ["route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          current_route_reservation_id: string | null
          current_slug: string | null
          deleted_at: string | null
          id: string
          level: string
          name: string
          normalized_name: string
          parent_id: string | null
          parent_level: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          id?: string
          level: string
          name: string
          normalized_name: string
          parent_id?: string | null
          parent_level?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          id?: string
          level?: string
          name?: string
          normalized_name?: string
          parent_id?: string | null
          parent_level?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "locations_current_route_reservation_id_fkey"
            columns: ["current_route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_id_parent_level_fkey"
            columns: ["parent_id", "parent_level"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "level"]
          },
        ]
      }
      media_processing_attempts: {
        Row: {
          attempt_number: number
          correlation_id: string
          created_at: string
          error_code: string | null
          error_detail: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          lease_owner: string | null
          processor_version: string
          property_media_id: string
          recipe_version: string
          source_version: number
          started_at: string
          status: string
        }
        Insert: {
          attempt_number: number
          correlation_id: string
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          processor_version: string
          property_media_id: string
          recipe_version: string
          source_version: number
          started_at: string
          status: string
        }
        Update: {
          attempt_number?: number
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          processor_version?: string
          property_media_id?: string
          recipe_version?: string
          source_version?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_processing_attempts_property_media_id_fkey"
            columns: ["property_media_id"]
            isOneToOne: false
            referencedRelation: "property_media"
            referencedColumns: ["id"]
          },
        ]
      }
      media_upload_sessions: {
        Row: {
          created_at: string
          expected_checksum_sha256: string | null
          expected_mime_type: string
          expires_at: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          initiated_by_user_identity_id: string
          maximum_bytes: number
          object_key: string
          planned_property_media_id: string
          property_id: string
          status: string
          updated_at: string
          uploaded_at: string | null
          uploaded_byte_size: number | null
          uploaded_checksum_sha256: string | null
          uploaded_etag: string | null
          version: number
        }
        Insert: {
          created_at?: string
          expected_checksum_sha256?: string | null
          expected_mime_type: string
          expires_at: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          initiated_by_user_identity_id: string
          maximum_bytes: number
          object_key: string
          planned_property_media_id?: string
          property_id: string
          status?: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_byte_size?: number | null
          uploaded_checksum_sha256?: string | null
          uploaded_etag?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          expected_checksum_sha256?: string | null
          expected_mime_type?: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          initiated_by_user_identity_id?: string
          maximum_bytes?: number
          object_key?: string
          planned_property_media_id?: string
          property_id?: string
          status?: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_byte_size?: number | null
          uploaded_checksum_sha256?: string | null
          uploaded_etag?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_upload_sessions_initiated_by_user_identity_id_fkey"
            columns: ["initiated_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_upload_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_messages: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          correlation_id: string
          created_at: string
          dead_lettered_at: string | null
          event_name: string
          event_version: number
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          next_attempt_at: string
          owning_domain: string
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          correlation_id: string
          created_at?: string
          dead_lettered_at?: string | null
          event_name: string
          event_version: number
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          owning_domain: string
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          correlation_id?: string
          created_at?: string
          dead_lettered_at?: string | null
          event_name?: string
          event_version?: number
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          next_attempt_at?: string
          owning_domain?: string
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line: string | null
          bathroom_count: number | null
          bedroom_count: number | null
          building_age_years: number | null
          created_at: string
          currency_code: string | null
          current_route_reservation_id: string | null
          current_slug: string | null
          current_state: string
          deleted_at: string | null
          description: string | null
          floor_area_sqm: number | null
          floor_number: number | null
          furnished: boolean | null
          gross_area_sqm: number | null
          heating_type_id: string | null
          id: string
          latitude: number | null
          listing_type_id: string
          living_room_count: number | null
          location_id: string
          location_visibility: string | null
          longitude: number | null
          net_area_sqm: number | null
          price_amount_minor: number | null
          property_type_id: string
          public_id: string
          published_at: string | null
          short_description: string | null
          title: string
          total_floor_count: number | null
          updated_at: string
          version: number
        }
        Insert: {
          address_line?: string | null
          bathroom_count?: number | null
          bedroom_count?: number | null
          building_age_years?: number | null
          created_at?: string
          currency_code?: string | null
          current_route_reservation_id?: string | null
          current_slug?: string | null
          current_state: string
          deleted_at?: string | null
          description?: string | null
          floor_area_sqm?: number | null
          floor_number?: number | null
          furnished?: boolean | null
          gross_area_sqm?: number | null
          heating_type_id?: string | null
          id?: string
          latitude?: number | null
          listing_type_id: string
          living_room_count?: number | null
          location_id: string
          location_visibility?: string | null
          longitude?: number | null
          net_area_sqm?: number | null
          price_amount_minor?: number | null
          property_type_id: string
          public_id: string
          published_at?: string | null
          short_description?: string | null
          title: string
          total_floor_count?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          address_line?: string | null
          bathroom_count?: number | null
          bedroom_count?: number | null
          building_age_years?: number | null
          created_at?: string
          currency_code?: string | null
          current_route_reservation_id?: string | null
          current_slug?: string | null
          current_state?: string
          deleted_at?: string | null
          description?: string | null
          floor_area_sqm?: number | null
          floor_number?: number | null
          furnished?: boolean | null
          gross_area_sqm?: number | null
          heating_type_id?: string | null
          id?: string
          latitude?: number | null
          listing_type_id?: string
          living_room_count?: number | null
          location_id?: string
          location_visibility?: string | null
          longitude?: number | null
          net_area_sqm?: number | null
          price_amount_minor?: number | null
          property_type_id?: string
          public_id?: string
          published_at?: string | null
          short_description?: string | null
          title?: string
          total_floor_count?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "properties_current_route_reservation_id_fkey"
            columns: ["current_route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_heating_type_id_fkey"
            columns: ["heating_type_id"]
            isOneToOne: false
            referencedRelation: "heating_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_listing_type_id_fkey"
            columns: ["listing_type_id"]
            isOneToOne: false
            referencedRelation: "listing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
        ]
      }
      property_advisor_assignments: {
        Row: {
          advisor_id: string
          assigned_at: string
          assigned_by_user_identity_id: string | null
          assignment_role: string
          end_reason: string | null
          ended_at: string | null
          id: string
          is_primary: boolean
          property_id: string
        }
        Insert: {
          advisor_id: string
          assigned_at?: string
          assigned_by_user_identity_id?: string | null
          assignment_role: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          property_id: string
        }
        Update: {
          advisor_id?: string
          assigned_at?: string
          assigned_by_user_identity_id?: string | null
          assignment_role?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_advisor_assignments_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "advisors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_advisor_assignments_assigned_by_user_identity_id_fkey"
            columns: ["assigned_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_advisor_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_customer_match_reasons: {
        Row: {
          contribution: number | null
          created_at: string
          explanation: string | null
          property_customer_match_id: string
          reason_code: string
        }
        Insert: {
          contribution?: number | null
          created_at?: string
          explanation?: string | null
          property_customer_match_id: string
          reason_code: string
        }
        Update: {
          contribution?: number | null
          created_at?: string
          explanation?: string | null
          property_customer_match_id?: string
          reason_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_customer_match_reasons_property_customer_match_id_fkey"
            columns: ["property_customer_match_id"]
            isOneToOne: false
            referencedRelation: "property_customer_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      property_customer_matches: {
        Row: {
          basis_fingerprint: string
          created_at: string
          customer_id: string
          customer_request_id: string
          deleted_at: string | null
          generated_at: string
          id: string
          property_id: string
          property_version: number
          request_version: number
          reviewed_at: string | null
          reviewed_by_user_identity_id: string | null
          rule_version: string
          score: number | null
          source: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          basis_fingerprint: string
          created_at?: string
          customer_id: string
          customer_request_id: string
          deleted_at?: string | null
          generated_at: string
          id?: string
          property_id: string
          property_version: number
          request_version: number
          reviewed_at?: string | null
          reviewed_by_user_identity_id?: string | null
          rule_version: string
          score?: number | null
          source: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          basis_fingerprint?: string
          created_at?: string
          customer_id?: string
          customer_request_id?: string
          deleted_at?: string | null
          generated_at?: string
          id?: string
          property_id?: string
          property_version?: number
          request_version?: number
          reviewed_at?: string | null
          reviewed_by_user_identity_id?: string | null
          rule_version?: string
          score?: number | null
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_customer_matches_customer_request_id_customer_id_fkey"
            columns: ["customer_request_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "property_customer_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_customer_matches_reviewed_by_user_identity_id_fkey"
            columns: ["reviewed_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      property_feature_assignments: {
        Row: {
          created_at: string
          feature_id: string
          property_id: string
          updated_at: string
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          feature_id: string
          property_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          feature_id?: string
          property_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_feature_assignments_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "property_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_feature_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_features: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          label: string
          status: string
          updated_at: string
          value_kind: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label: string
          status?: string
          updated_at?: string
          value_kind: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label?: string
          status?: string
          updated_at?: string
          value_kind?: string
          version?: number
        }
        Relationships: []
      }
      property_media: {
        Row: {
          alt_text: string | null
          alt_text_source: string | null
          byte_size: number | null
          caption: string | null
          checksum_sha256: string | null
          created_at: string
          created_by_user_identity_id: string | null
          current_recipe_version: string | null
          deleted_at: string | null
          deleted_by_user_identity_id: string | null
          deletion_reason_code: string | null
          detected_mime_type: string | null
          failure_code: string | null
          failure_retryable: boolean | null
          height_px: number | null
          id: string
          is_cover: boolean
          media_role: string
          original_object_key: string | null
          processor_version: string | null
          property_id: string
          purged_at: string | null
          ready_at: string | null
          sort_order: number
          source_version: number
          state: string
          updated_at: string
          upload_session_id: string | null
          version: number
          visibility: string
          width_px: number | null
        }
        Insert: {
          alt_text?: string | null
          alt_text_source?: string | null
          byte_size?: number | null
          caption?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by_user_identity_id?: string | null
          current_recipe_version?: string | null
          deleted_at?: string | null
          deleted_by_user_identity_id?: string | null
          deletion_reason_code?: string | null
          detected_mime_type?: string | null
          failure_code?: string | null
          failure_retryable?: boolean | null
          height_px?: number | null
          id?: string
          is_cover?: boolean
          media_role: string
          original_object_key?: string | null
          processor_version?: string | null
          property_id: string
          purged_at?: string | null
          ready_at?: string | null
          sort_order: number
          source_version?: number
          state: string
          updated_at?: string
          upload_session_id?: string | null
          version?: number
          visibility: string
          width_px?: number | null
        }
        Update: {
          alt_text?: string | null
          alt_text_source?: string | null
          byte_size?: number | null
          caption?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by_user_identity_id?: string | null
          current_recipe_version?: string | null
          deleted_at?: string | null
          deleted_by_user_identity_id?: string | null
          deletion_reason_code?: string | null
          detected_mime_type?: string | null
          failure_code?: string | null
          failure_retryable?: boolean | null
          height_px?: number | null
          id?: string
          is_cover?: boolean
          media_role?: string
          original_object_key?: string | null
          processor_version?: string | null
          property_id?: string
          purged_at?: string | null
          ready_at?: string | null
          sort_order?: number
          source_version?: number
          state?: string
          updated_at?: string
          upload_session_id?: string | null
          version?: number
          visibility?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_media_created_by_user_identity_id_fkey"
            columns: ["created_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_deleted_by_user_identity_id_fkey"
            columns: ["deleted_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: true
            referencedRelation: "media_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media_variants: {
        Row: {
          byte_size: number
          checksum_sha256: string
          created_at: string
          format: string
          height_px: number
          id: string
          object_key: string
          property_media_id: string
          purged_at: string | null
          recipe_version: string
          source_version: number
          width_px: number
        }
        Insert: {
          byte_size: number
          checksum_sha256: string
          created_at?: string
          format: string
          height_px: number
          id?: string
          object_key: string
          property_media_id: string
          purged_at?: string | null
          recipe_version: string
          source_version: number
          width_px: number
        }
        Update: {
          byte_size?: number
          checksum_sha256?: string
          created_at?: string
          format?: string
          height_px?: number
          id?: string
          object_key?: string
          property_media_id?: string
          purged_at?: string | null
          recipe_version?: string
          source_version?: number
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_media_variants_property_media_id_fkey"
            columns: ["property_media_id"]
            isOneToOne: false
            referencedRelation: "property_media"
            referencedColumns: ["id"]
          },
        ]
      }
      property_price_history: {
        Row: {
          amount_minor: number
          changed_by_user_identity_id: string | null
          correction_of_price_history_id: string | null
          created_at: string
          currency_code: string
          effective_at: string
          id: string
          idempotency_key: string
          property_id: string
          property_version: number
          reason_code: string | null
          source: string
        }
        Insert: {
          amount_minor: number
          changed_by_user_identity_id?: string | null
          correction_of_price_history_id?: string | null
          created_at?: string
          currency_code: string
          effective_at: string
          id?: string
          idempotency_key: string
          property_id: string
          property_version: number
          reason_code?: string | null
          source: string
        }
        Update: {
          amount_minor?: number
          changed_by_user_identity_id?: string | null
          correction_of_price_history_id?: string | null
          created_at?: string
          currency_code?: string
          effective_at?: string
          id?: string
          idempotency_key?: string
          property_id?: string
          property_version?: number
          reason_code?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_price_history_changed_by_user_identity_id_fkey"
            columns: ["changed_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_price_history_correction_of_price_history_id_fkey"
            columns: ["correction_of_price_history_id"]
            isOneToOne: false
            referencedRelation: "property_price_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_price_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_slug_history: {
        Row: {
          created_at: string
          id: string
          property_id: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          retired_at: string
          route_reservation_id: string
          slug: string
          valid_from: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          retired_at?: string
          route_reservation_id?: string
          slug?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_slug_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_slug_history_route_reservation_id_fkey"
            columns: ["route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_state_history: {
        Row: {
          changed_by_user_identity_id: string | null
          closing_amount_minor: number | null
          closing_currency_code: string | null
          closing_date: string | null
          correlation_id: string
          from_state: string | null
          id: string
          idempotency_key: string
          intention_code: string
          occurred_at: string
          property_id: string
          property_version: number
          reason_code: string | null
          reservation_advisor_id: string | null
          reservation_expires_at: string | null
          reservation_reference: string | null
          to_state: string
        }
        Insert: {
          changed_by_user_identity_id?: string | null
          closing_amount_minor?: number | null
          closing_currency_code?: string | null
          closing_date?: string | null
          correlation_id: string
          from_state?: string | null
          id?: string
          idempotency_key: string
          intention_code: string
          occurred_at?: string
          property_id: string
          property_version: number
          reason_code?: string | null
          reservation_advisor_id?: string | null
          reservation_expires_at?: string | null
          reservation_reference?: string | null
          to_state: string
        }
        Update: {
          changed_by_user_identity_id?: string | null
          closing_amount_minor?: number | null
          closing_currency_code?: string | null
          closing_date?: string | null
          correlation_id?: string
          from_state?: string | null
          id?: string
          idempotency_key?: string
          intention_code?: string
          occurred_at?: string
          property_id?: string
          property_version?: number
          reason_code?: string | null
          reservation_advisor_id?: string | null
          reservation_expires_at?: string | null
          reservation_reference?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_state_history_changed_by_user_identity_id_fkey"
            columns: ["changed_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_state_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_state_history_reservation_advisor_id_fkey"
            columns: ["reservation_advisor_id"]
            isOneToOne: false
            referencedRelation: "advisors"
            referencedColumns: ["id"]
          },
        ]
      }
      property_types: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          label: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          label?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      public_route_reservations: {
        Row: {
          created_at: string
          id: string
          retired_at: string | null
          route_key: string
          route_kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          retired_at?: string | null
          route_key: string
          route_kind: string
        }
        Update: {
          created_at?: string
          id?: string
          retired_at?: string | null
          route_key?: string
          route_kind?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          granted_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      seo_page_features: {
        Row: {
          created_at: string
          feature_id: string
          operator: string
          seo_page_id: string
          updated_at: string
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          feature_id: string
          operator: string
          seo_page_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          feature_id?: string
          operator?: string
          seo_page_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "property_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_features_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_query_definitions: {
        Row: {
          created_at: string
          currency_code: string | null
          deleted_at: string | null
          id: string
          listing_type_id: string | null
          location_id: string | null
          normalized_fingerprint: string
          price_max_minor: number | null
          price_min_minor: number | null
          property_type_id: string | null
          schema_version: number
          seo_page_id: string
          sort_policy: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          id?: string
          listing_type_id?: string | null
          location_id?: string | null
          normalized_fingerprint: string
          price_max_minor?: number | null
          price_min_minor?: number | null
          property_type_id?: string | null
          schema_version?: number
          seo_page_id: string
          sort_policy: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          id?: string
          listing_type_id?: string | null
          location_id?: string | null
          normalized_fingerprint?: string
          price_max_minor?: number | null
          price_min_minor?: number | null
          property_type_id?: string | null
          schema_version?: number
          seo_page_id?: string
          sort_policy?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_query_definitions_listing_type_id_fkey"
            columns: ["listing_type_id"]
            isOneToOne: false
            referencedRelation: "listing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_query_definitions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_query_definitions_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_query_definitions_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: true
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_slug_history: {
        Row: {
          created_at: string
          id: string
          retired_at: string
          route_reservation_id: string
          seo_page_id: string
          slug: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          id?: string
          retired_at: string
          route_reservation_id: string
          seo_page_id: string
          slug: string
          valid_from: string
        }
        Update: {
          created_at?: string
          id?: string
          retired_at?: string
          route_reservation_id?: string
          seo_page_id?: string
          slug?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_slug_history_route_reservation_id_fkey"
            columns: ["route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_slug_history_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_pages: {
        Row: {
          approved_at: string | null
          approved_by_user_identity_id: string | null
          created_at: string
          current_route_reservation_id: string | null
          current_slug: string | null
          deleted_at: string | null
          id: string
          indexability: string
          intro_content: string | null
          meta_description: string | null
          meta_title: string | null
          page_kind: string
          published_at: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_identity_id?: string | null
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          id?: string
          indexability: string
          intro_content?: string | null
          meta_description?: string | null
          meta_title?: string | null
          page_kind: string
          published_at?: string | null
          status: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by_user_identity_id?: string | null
          created_at?: string
          current_route_reservation_id?: string | null
          current_slug?: string | null
          deleted_at?: string | null
          id?: string
          indexability?: string
          intro_content?: string | null
          meta_description?: string | null
          meta_title?: string | null
          page_kind?: string
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_pages_approved_by_user_identity_id_fkey"
            columns: ["approved_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_pages_current_route_reservation_id_fkey"
            columns: ["current_route_reservation_id"]
            isOneToOne: true
            referencedRelation: "public_route_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          schema_version: number
          setting_key: string
          setting_value: Json
          status: string
          updated_at: string
          updated_by_user_identity_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          schema_version?: number
          setting_key: string
          setting_value: Json
          status?: string
          updated_at?: string
          updated_by_user_identity_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          schema_version?: number
          setting_key?: string
          setting_value?: Json
          status?: string
          updated_at?: string
          updated_by_user_identity_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_user_identity_id_fkey"
            columns: ["updated_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_identities: {
        Row: {
          auth_provider: string
          created_at: string
          deleted_at: string | null
          id: string
          last_sign_in_at: string | null
          provider_subject: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          auth_provider: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_sign_in_at?: string | null
          provider_subject: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          auth_provider?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_sign_in_at?: string | null
          provider_subject?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by_user_identity_id: string | null
          expires_at: string | null
          granted_at: string
          granted_by_user_identity_id: string | null
          id: string
          role_id: string
          status: string
          user_identity_id: string
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by_user_identity_id?: string | null
          expires_at?: string | null
          granted_at?: string
          granted_by_user_identity_id?: string | null
          id?: string
          role_id: string
          status?: string
          user_identity_id: string
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by_user_identity_id?: string | null
          expires_at?: string | null
          granted_at?: string
          granted_by_user_identity_id?: string | null
          id?: string
          role_id?: string
          status?: string
          user_identity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_ended_by_user_identity_id_fkey"
            columns: ["ended_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_granted_by_user_identity_id_fkey"
            columns: ["granted_by_user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_user_identity_id_fkey"
            columns: ["user_identity_id"]
            isOneToOne: false
            referencedRelation: "user_identities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
