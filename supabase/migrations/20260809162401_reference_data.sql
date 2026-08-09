insert into public.roles (id, code, name, description) values
  ('10000000-0000-4000-8000-000000000001','ADMIN','Administrator','V1 full staff administration role; MFA/AAL2 required for authenticated database access.'),
  ('10000000-0000-4000-8000-000000000002','ADVISOR','Advisor','V1 assignment-scoped property and CRM role.');

insert into public.permissions (id, code, description) values
  ('20000000-0000-4000-8000-000000000001','properties.publish','Allows an assigned ADVISOR to publish or unpublish a property.');

-- The explicit permission exists but is intentionally not attached to ADVISOR by
-- default. ADMIN may grant it to the ADVISOR role through a reviewed role command.
insert into public.listing_types (id, code, label) values
  ('30000000-0000-4000-8000-000000000001','SATILIK','Satılık'),
  ('30000000-0000-4000-8000-000000000002','KIRALIK','Kiralık');
