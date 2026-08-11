begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

insert into public.customers(id,display_name) values ('91000000-0000-4000-8000-000000000001','Matching TAP customer');
insert into public.customer_requests(id,customer_id,status,listing_type_id,net_area_min)
select '91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','ACTIVE',id,10 from public.listing_types where code='SATILIK';
insert into public.property_types(id,code,label) values ('91000000-0000-4000-8000-000000000003','MATCHING_TAP','Matching TAP');
insert into public.locations(id,level,name,normalized_name) values ('91000000-0000-4000-8000-000000000004','CITY','Matching TAP City','matching-tap-city');
insert into public.properties(id,public_id,listing_type_id,property_type_id,location_id,title,current_state,net_area_sqm)
select '91000000-0000-4000-8000-000000000005','matching-tap-property',lt.id,'91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004','Matching TAP property','ACTIVE',50 from public.listing_types lt where lt.code='SATILIK';
insert into public.property_customer_matches(id,property_id,customer_id,customer_request_id,rule_version,property_version,request_version,basis_fingerprint,status,source,score,generated_at)
values ('91000000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','matching-v2',1,1,repeat('a',64),'PROPOSED','RULES',0.5,now());

update public.customer_requests set net_area_min=11 where id='91000000-0000-4000-8000-000000000002';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','request net area invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
update public.customer_requests set matching_budget_state='FLEXIBLE' where id='91000000-0000-4000-8000-000000000002';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','matching criterion state invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
insert into public.property_features(id,code,label,value_kind) values ('91000000-0000-4000-8000-000000000007','MATCHING_TAP_FEATURE','Matching TAP feature','flag');
insert into public.customer_request_features(customer_request_id,feature_id,priority) values ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000007','required');
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','request feature insert invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
delete from public.customer_request_features where customer_request_id='91000000-0000-4000-8000-000000000002';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','request feature delete invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
update public.properties set net_area_sqm=51 where id='91000000-0000-4000-8000-000000000005';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','property net area invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
insert into public.property_feature_assignments(property_id,feature_id) values ('91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000007');
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','property feature insert invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
update public.property_feature_assignments set value_boolean=true where property_id='91000000-0000-4000-8000-000000000005' and feature_id='91000000-0000-4000-8000-000000000007';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','property feature update invalidates current matches');
update public.property_customer_matches set status='PROPOSED' where id='91000000-0000-4000-8000-000000000006';
delete from public.property_feature_assignments where property_id='91000000-0000-4000-8000-000000000005' and feature_id='91000000-0000-4000-8000-000000000007';
select extensions.is((select status from public.property_customer_matches where id='91000000-0000-4000-8000-000000000006'),'STALE','property feature delete invalidates current matches');

select * from extensions.finish();
rollback;
