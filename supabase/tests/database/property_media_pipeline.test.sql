begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(21);

select extensions.has_column('public', 'media_upload_sessions', 'planned_property_media_id', 'upload session retains its server-generated media identity');
select extensions.col_is_unique('public', 'media_upload_sessions', 'planned_property_media_id', 'planned media identity is unique across upload sessions');

select extensions.has_column('public', 'media_upload_sessions', 'uploaded_byte_size', 'upload session records observed bytes');
select extensions.has_column('public', 'media_upload_sessions', 'uploaded_checksum_sha256', 'upload session records observed checksum');
select extensions.has_column('public', 'media_upload_sessions', 'uploaded_etag', 'upload session records observed etag');
select extensions.has_column('public', 'media_upload_sessions', 'uploaded_at', 'upload session records observed completion time');

select extensions.has_column('public', 'property_media', 'current_recipe_version', 'media records current recipe version');
select extensions.has_column('public', 'property_media', 'processor_version', 'media records processor version');
select extensions.has_column('public', 'property_media', 'failure_code', 'media records safe failure code');
select extensions.has_column('public', 'property_media', 'failure_retryable', 'media records retry classification');
select extensions.has_column('public', 'property_media', 'deleted_by_user_identity_id', 'media deletion records actor');
select extensions.has_column('public', 'property_media', 'deletion_reason_code', 'media deletion records reason');

select extensions.fk_ok(
  'public', 'property_media', 'deleted_by_user_identity_id',
  'public', 'user_identities', 'id',
  'media deletion actor foreign key exists'
);
select extensions.is(
  (select confupdtype::text || confdeltype::text from pg_catalog.pg_constraint
    where conname = 'property_media_deleted_by_user_identity_id_fkey'),
  'rr',
  'media deletion actor FK explicitly restricts update and delete'
);

select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conname='media_upload_sessions_observed_upload_consistency' and contype='c'),
  'finalized upload observation consistency is database-enforced'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conname='property_media_processing_result_consistency' and contype='c'),
  'processing result consistency is database-enforced'
);
select extensions.ok(
  exists (select 1 from pg_catalog.pg_constraint where conname='property_media_ready_requires_original'
    and pg_get_constraintdef(oid) not like '%DELETED%'),
  'pre-processing media can be soft-deleted without inventing an original object'
);

select extensions.has_index('public', 'media_upload_sessions', 'media_upload_sessions_expiry_idx', 'active upload expiry cleanup is indexed');
select extensions.has_index('public', 'property_media', 'property_media_processable_idx', 'processable media claiming is indexed');
select extensions.has_index('public', 'property_media', 'property_media_public_projection_idx', 'ready public media projection is indexed');
select extensions.has_index('public', 'media_processing_attempts', 'media_processing_attempts_reclaim_idx', 'expired processing leases are indexed');

select * from extensions.finish();
rollback;
