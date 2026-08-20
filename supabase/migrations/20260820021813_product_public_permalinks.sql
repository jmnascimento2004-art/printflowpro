alter table public.products
  add column if not exists slug text;

create or replace function private.normalize_product_slug(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-{2,}', '-', 'g'
  ))
$$;

revoke all on function private.normalize_product_slug(text)
from public, anon, authenticated;

create or replace function private.allocate_product_slug(
  p_company_id text,
  p_product_id text,
  p_candidate text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base text := private.normalize_product_slug(p_candidate);
  v_slug text;
  v_suffix integer := 1;
begin
  if nullif(p_company_id, '') is null or nullif(p_product_id, '') is null then
    raise exception using errcode = '23502', message = 'PRODUCT_SLUG_IDENTITY_REQUIRED';
  end if;

  if v_base = '' then
    v_base := 'produto-' || substring(md5(p_product_id) from 1 for 8);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('product-slug:' || p_company_id, 0)
  );

  v_slug := v_base;
  while exists (
    select 1
    from public.products p
    where p.company_id = p_company_id
      and p.slug = v_slug
      and p.id <> p_product_id
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  end loop;

  return v_slug;
end;
$$;

revoke all on function private.allocate_product_slug(text, text, text)
from public, anon, authenticated;

create or replace function private.ensure_product_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.company_id is not distinct from old.company_id
     and old.slug is not null
     and new.slug is not distinct from old.slug then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.slug is not null
     and nullif(btrim(coalesce(new.slug, '')), '') is null then
    new.slug := old.slug;
    return new;
  end if;

  new.slug := private.allocate_product_slug(
    new.company_id,
    new.id,
    coalesce(nullif(new.slug, ''), new.name)
  );
  return new;
end;
$$;

revoke all on function private.ensure_product_slug()
from public, anon, authenticated;

drop trigger if exists ensure_product_slug on public.products;
create trigger ensure_product_slug
before insert or update of company_id, name, slug
on public.products
for each row
execute function private.ensure_product_slug();

do $$
declare
  v_product_id text;
begin
  for v_product_id in
    select p.id
    from public.products p
    where p.slug is null
    order by p.company_id, p.created_at, p.id
  loop
    update public.products
    set slug = null
    where id = v_product_id;
  end loop;
end;
$$;

alter table public.products
  alter column slug set not null;

alter table public.products
  drop constraint if exists products_slug_format_check;
alter table public.products
  add constraint products_slug_format_check
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

alter table public.products
  drop constraint if exists products_company_slug_key;
alter table public.products
  add constraint products_company_slug_key unique (company_id, slug);

-- A reserved permalink must not disclose an active product that is still
-- intentionally outside the public catalog. Tenant policies remain additive,
-- so authenticated administrators can continue to manage their own products.
drop policy if exists "public_store_products_select" on public.products;
create policy "public_store_products_select"
on public.products for select
to anon, authenticated
using (active = true and catalog_active = true);

create or replace function private.audit_product_slug_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_actor_profile_id text;
  v_actor_name text;
  v_actor_role text;
  v_actor_company_id text;
  v_is_system boolean := false;
begin
  if old.slug is not distinct from new.slug then
    return new;
  end if;

  if v_actor_user_id is null then
    if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
      return new;
    end if;
    v_is_system := true;
    v_actor_name := 'SYSTEM';
    v_actor_role := 'system';
  else
    select p.id, p.name, p.role, p.company_id
      into v_actor_profile_id, v_actor_name, v_actor_role, v_actor_company_id
    from public.profiles p
    where p.auth_user_id = v_actor_user_id
      and p.active = true
    order by p.id
    limit 1;

    if not found or v_actor_company_id is distinct from new.company_id then
      raise exception using errcode = '42501', message = 'PRODUCT_SLUG_ACTOR_NOT_AUTHORIZED';
    end if;
  end if;

  insert into public.audit_logs (
    company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata
  ) values (
    new.company_id, v_actor_user_id, v_actor_profile_id, v_actor_name, v_actor_role,
    'product.slug_changed', 'products', new.id, 'products',
    jsonb_build_object('slug', old.slug),
    jsonb_build_object('slug', new.slug),
    jsonb_build_object(
      'source', case when v_is_system then 'server_system_mutation' else 'authenticated_database_mutation' end,
      'actor_kind', case when v_is_system then 'system' else 'human' end,
      'operation', 'update'
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_product_slug_change()
from public, anon, authenticated;

drop trigger if exists audit_product_slug_change on public.products;
create trigger audit_product_slug_change
after update of slug
on public.products
for each row
when (old.slug is distinct from new.slug)
execute function private.audit_product_slug_change();
