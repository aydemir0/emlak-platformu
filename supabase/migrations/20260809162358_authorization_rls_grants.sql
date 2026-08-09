create function private.current_user_identity_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select ui.id from public.user_identities ui
  where ui.auth_provider='supabase' and ui.provider_subject=(select auth.uid())::text
    and ui.status='active' and ui.deleted_at is null
  limit 1
$$;
create function private.has_role(role_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_role_assignments ura
    join public.roles r on r.id=ura.role_id
    where ura.user_identity_id=private.current_user_identity_id()
      and ura.status='ACTIVE' and (ura.expires_at is null or ura.expires_at > statement_timestamp())
      and r.code=role_code and r.status='active' and r.deleted_at is null
  )
$$;
create function private.has_permission(permission_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_role_assignments ura
    join public.roles r on r.id=ura.role_id and r.status='active' and r.deleted_at is null
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id and p.status='active' and p.deleted_at is null
    where ura.user_identity_id=private.current_user_identity_id()
      and ura.status='ACTIVE' and (ura.expires_at is null or ura.expires_at > statement_timestamp())
      and p.code=permission_code
  )
$$;
create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('ADMIN') and coalesce((select auth.jwt()->>'aal'),'')='aal2'
$$;
create function private.current_advisor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.advisors a where a.user_identity_id=private.current_user_identity_id()
    and a.status='active' and a.deleted_at is null limit 1
$$;
create function private.can_manage_property(property_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (
    private.has_role('ADVISOR') and exists (
      select 1 from public.property_advisor_assignments paa
      where paa.property_id=property_key and paa.advisor_id=private.current_advisor_id() and paa.ended_at is null
    )
  )
$$;
create function private.can_manage_customer(customer_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (
    private.has_role('ADVISOR') and exists (
      select 1 from public.customers c
      where c.id=customer_key and c.assigned_advisor_id=private.current_advisor_id() and c.deleted_at is null
    )
  )
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_user_identity_id(), private.has_role(text), private.has_permission(text),
  private.is_admin(), private.current_advisor_id(), private.can_manage_property(uuid), private.can_manage_customer(uuid) to authenticated;

-- Close Data API access at the SQL privilege layer as well as config.toml.
revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Every canonical table is RLS-protected and owner access is forced. service_role
-- remains Supabase's trusted BYPASSRLS server/worker role; no bypass helper is added.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'user_identities','advisors','roles','permissions','role_permissions','user_role_assignments',
    'listing_types','property_types','public_route_reservations','locations','properties','property_state_history',
    'property_slug_history','location_slug_history','property_features','property_feature_assignments',
    'property_advisor_assignments','property_price_history','media_upload_sessions','property_media',
    'property_media_variants','media_processing_attempts','leads','customers','lead_conversions',
    'customer_contact_points','customer_merge_history','customer_requests','customer_request_features',
    'customer_activities','appointments','property_customer_matches','property_customer_match_reasons',
    'seo_pages','seo_page_query_definitions','seo_page_features','seo_page_slug_history','content_entries',
    'content_slug_history','analytics_event_definitions','analytics_events','audit_logs','outbox_messages','site_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('create policy admin_all on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', table_name);
  end loop;
end
$$;

-- ADVISOR property aggregate scope. No delete policies exist.
create policy advisor_property_select on public.properties for select to authenticated
  using ((select private.has_role('ADVISOR')) and (select private.can_manage_property(id)));
create policy advisor_property_update on public.properties for update to authenticated
  using ((select private.can_manage_property(id))) with check ((select private.can_manage_property(id)));
create policy advisor_property_assignments_select on public.property_advisor_assignments for select to authenticated
  using ((select private.can_manage_property(property_id)));
create policy advisor_property_features_select on public.property_feature_assignments for select to authenticated using ((select private.can_manage_property(property_id)));
create policy advisor_property_features_insert on public.property_feature_assignments for insert to authenticated with check ((select private.can_manage_property(property_id)));
create policy advisor_property_features_update on public.property_feature_assignments for update to authenticated using ((select private.can_manage_property(property_id))) with check ((select private.can_manage_property(property_id)));
create policy advisor_property_state_history_select on public.property_state_history for select to authenticated
  using ((select private.can_manage_property(property_id)));
create policy advisor_property_state_history_insert on public.property_state_history for insert to authenticated
  with check ((select private.can_manage_property(property_id)));
create policy advisor_property_price_history_select on public.property_price_history for select to authenticated
  using ((select private.can_manage_property(property_id)));
create policy advisor_property_price_history_insert on public.property_price_history for insert to authenticated
  with check ((select private.can_manage_property(property_id)));
create policy advisor_upload_sessions_select on public.media_upload_sessions for select to authenticated using ((select private.can_manage_property(property_id)));
create policy advisor_upload_sessions_insert on public.media_upload_sessions for insert to authenticated with check ((select private.can_manage_property(property_id)));
create policy advisor_upload_sessions_update on public.media_upload_sessions for update to authenticated using ((select private.can_manage_property(property_id))) with check ((select private.can_manage_property(property_id)));
create policy advisor_property_media_select on public.property_media for select to authenticated using ((select private.can_manage_property(property_id)));
create policy advisor_property_media_insert on public.property_media for insert to authenticated with check ((select private.can_manage_property(property_id)));
create policy advisor_property_media_update on public.property_media for update to authenticated using ((select private.can_manage_property(property_id))) with check ((select private.can_manage_property(property_id)));
create policy advisor_media_variants_select on public.property_media_variants for select to authenticated
  using (exists (select 1 from public.property_media pm where pm.id=property_media_id and (select private.can_manage_property(pm.property_id))));

-- ADVISOR CRM scope through the trusted advisor relationships.
create policy advisor_customers_select on public.customers for select to authenticated using ((select private.can_manage_customer(id)));
create policy advisor_customers_update on public.customers for update to authenticated
  using ((select private.can_manage_customer(id))) with check ((select private.can_manage_customer(id)));
create policy advisor_leads_select on public.leads for select to authenticated using (assigned_advisor_id=(select private.current_advisor_id()));
create policy advisor_leads_insert on public.leads for insert to authenticated with check (assigned_advisor_id=(select private.current_advisor_id()));
create policy advisor_leads_update on public.leads for update to authenticated using (assigned_advisor_id=(select private.current_advisor_id())) with check (assigned_advisor_id=(select private.current_advisor_id()));
create policy advisor_contacts_select on public.customer_contact_points for select to authenticated using ((select private.can_manage_customer(customer_id)));
create policy advisor_contacts_insert on public.customer_contact_points for insert to authenticated with check ((select private.can_manage_customer(customer_id)));
create policy advisor_contacts_update on public.customer_contact_points for update to authenticated using ((select private.can_manage_customer(customer_id))) with check ((select private.can_manage_customer(customer_id)));
create policy advisor_requests_select on public.customer_requests for select to authenticated using ((select private.can_manage_customer(customer_id)));
create policy advisor_requests_insert on public.customer_requests for insert to authenticated with check ((select private.can_manage_customer(customer_id)));
create policy advisor_requests_update on public.customer_requests for update to authenticated using ((select private.can_manage_customer(customer_id))) with check ((select private.can_manage_customer(customer_id)));
create policy advisor_request_features_select on public.customer_request_features for select to authenticated using (exists (select 1 from public.customer_requests cr where cr.id=customer_request_id and (select private.can_manage_customer(cr.customer_id))));
create policy advisor_request_features_insert on public.customer_request_features for insert to authenticated with check (exists (select 1 from public.customer_requests cr where cr.id=customer_request_id and (select private.can_manage_customer(cr.customer_id))));
create policy advisor_request_features_update on public.customer_request_features for update to authenticated using (exists (select 1 from public.customer_requests cr where cr.id=customer_request_id and (select private.can_manage_customer(cr.customer_id)))) with check (exists (select 1 from public.customer_requests cr where cr.id=customer_request_id and (select private.can_manage_customer(cr.customer_id))));
create policy advisor_activities_select on public.customer_activities for select to authenticated using ((select private.can_manage_customer(customer_id)));
create policy advisor_activities_insert on public.customer_activities for insert to authenticated with check ((select private.can_manage_customer(customer_id)));
create policy advisor_appointments_select on public.appointments for select to authenticated using (advisor_id=(select private.current_advisor_id()) and (select private.can_manage_customer(customer_id)));
create policy advisor_appointments_insert on public.appointments for insert to authenticated with check (advisor_id=(select private.current_advisor_id()) and (select private.can_manage_customer(customer_id)));
create policy advisor_appointments_update on public.appointments for update to authenticated using (advisor_id=(select private.current_advisor_id()) and (select private.can_manage_customer(customer_id))) with check (advisor_id=(select private.current_advisor_id()) and (select private.can_manage_customer(customer_id)));
create policy advisor_matches_select on public.property_customer_matches for select to authenticated using ((select private.can_manage_property(property_id)) and (select private.can_manage_customer(customer_id)));
create policy advisor_matches_insert on public.property_customer_matches for insert to authenticated with check ((select private.can_manage_property(property_id)) and (select private.can_manage_customer(customer_id)));
create policy advisor_matches_update on public.property_customer_matches for update to authenticated using ((select private.can_manage_property(property_id)) and (select private.can_manage_customer(customer_id))) with check ((select private.can_manage_property(property_id)) and (select private.can_manage_customer(customer_id)));

create function private.enforce_advisor_property_command()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_admin() then return new; end if;
  if not private.has_role('ADVISOR') or not private.can_manage_property(old.id) then
    raise exception 'property command outside advisor scope' using errcode='42501';
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    raise exception 'ADVISOR cannot delete or restore properties' using errcode='42501';
  end if;
  if (old.current_state is distinct from new.current_state or old.published_at is distinct from new.published_at)
     and not private.has_permission('properties.publish') then
    raise exception 'ADVISOR publish/unpublish requires properties.publish' using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_advisor_property_command() from public, anon, authenticated;
create trigger enforce_advisor_property_command before update on public.properties
for each row execute function private.enforce_advisor_property_command();
