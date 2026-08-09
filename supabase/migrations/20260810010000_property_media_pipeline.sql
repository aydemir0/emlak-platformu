-- Phase 6 property-media workflow facts. PostgreSQL owns lifecycle metadata;
-- R2 owns bytes only. The migration is additive and seeds no media vocabulary.

alter table public.media_upload_sessions
  add column planned_property_media_id uuid not null default gen_random_uuid(),
  add column uploaded_byte_size bigint,
  add column uploaded_checksum_sha256 text,
  add column uploaded_etag text,
  add column uploaded_at timestamptz,
  add constraint media_upload_sessions_uploaded_byte_size_positive
    check (uploaded_byte_size is null or uploaded_byte_size > 0),
  add constraint media_upload_sessions_expected_checksum_format
    check (expected_checksum_sha256 is null or expected_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint media_upload_sessions_uploaded_checksum_format
    check (uploaded_checksum_sha256 is null or uploaded_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint media_upload_sessions_observed_upload_consistency
    check (
      (status = 'FINALIZED') =
      (
        uploaded_byte_size is not null
        and uploaded_checksum_sha256 is not null
        and uploaded_etag is not null
        and uploaded_at is not null
      )
    );

alter table public.media_upload_sessions
  add constraint media_upload_sessions_planned_property_media_id_key
    unique (planned_property_media_id);

alter table public.property_media
  drop constraint property_media_check1,
  add column current_recipe_version text,
  add column processor_version text,
  add column failure_code text,
  add column failure_retryable boolean,
  add column deleted_by_user_identity_id uuid,
  add column deletion_reason_code text,
  add constraint property_media_deleted_by_user_identity_id_fkey
    foreign key (deleted_by_user_identity_id)
    references public.user_identities(id)
    on update restrict on delete restrict,
  add constraint property_media_processing_result_consistency
    check (
      (
        state = 'READY'
        and current_recipe_version is not null
        and processor_version is not null
        and failure_code is null
        and failure_retryable is null
      )
      or
      (
        state = 'FAILED'
        and current_recipe_version is null
        and processor_version is not null
        and failure_code is not null
        and failure_retryable is not null
      )
      or
      (
        state in ('UPLOADED', 'PROCESSING', 'DELETED')
        and current_recipe_version is null
        and failure_code is null
        and failure_retryable is null
      )
    ),
  add constraint property_media_deletion_consistency
    check (
      (state = 'DELETED') = (deleted_at is not null)
      and (deleted_at is null or (deleted_by_user_identity_id is not null and deletion_reason_code is not null))
    );

alter table public.property_media
  add constraint property_media_ready_requires_original
    check (state <> 'READY' or original_object_key is not null);

create index media_upload_sessions_expiry_idx
  on public.media_upload_sessions (expires_at, id)
  where status in ('REQUESTED', 'UPLOADING');

create index property_media_processable_idx
  on public.property_media (state, updated_at, id)
  where deleted_at is null and state in ('UPLOADED', 'FAILED');

create index property_media_public_projection_idx
  on public.property_media (property_id, sort_order, id)
  where state = 'READY' and visibility = 'PUBLIC' and deleted_at is null;

create index media_processing_attempts_reclaim_idx
  on public.media_processing_attempts (lease_expires_at, created_at, id)
  where status = 'CLAIMED';

comment on column public.property_media.current_recipe_version is
  'Technical READY recipe only; READY never implies current public eligibility.';
comment on column public.media_upload_sessions.uploaded_checksum_sha256 is
  'Observed server-side SHA-256 after upload; browser declarations are never authoritative.';
