-- Phase 11 Package C: additive, historical conversion provenance.
-- Existing conversion rows intentionally keep these fields null because their
-- deterministic resolution path and initial request relationship are unknown.

alter table public.lead_conversions
  add column customer_request_id uuid
    references public.customer_requests(id) on update restrict on delete restrict,
  add column resolution_kind text,
  add column resolution_evidence_code text,
  add constraint lead_conversions_resolution_kind_check check (
    resolution_kind is null or resolution_kind in (
      'CREATED_NEW_CUSTOMER',
      'LINKED_EXPLICIT_CUSTOMER',
      'LINKED_EXACT_IDENTITY'
    )
  ),
  add constraint lead_conversions_resolution_evidence_code_check check (
    resolution_evidence_code is null or resolution_evidence_code in (
      'EXPLICIT_CUSTOMER_SELECTION',
      'EXACT_EMAIL',
      'EXACT_PHONE',
      'EXACT_EMAIL_AND_PHONE'
    )
  );

-- Supports referential checks on a customer request and the future conversion
-- read model without indexing legacy rows that have no request association.
create index lead_conversions_customer_request_id_idx
  on public.lead_conversions(customer_request_id)
  where customer_request_id is not null;
