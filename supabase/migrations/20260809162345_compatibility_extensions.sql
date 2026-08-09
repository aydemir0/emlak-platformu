do $$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'PostgreSQL 15 or newer is required (security_invoker support); found %',
      current_setting('server_version');
  end if;
end
$$;

create schema private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

comment on schema private is
  'Non-API authorization and integrity helpers; never add to PostgREST exposed schemas.';
