-- Public catalogue reads already use the server's explicit projection. A public
-- row policy on the base table exposes internal costs to authenticated clients.
drop policy if exists public_store_products_select on public.products;

-- Typed configuration stays on its tenant-owned product; no second cost ledger.
create or replace function private.validate_product_configuration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  composition jsonb := new.pricing_details -> 'cost_composition';
  fields jsonb := new.pricing_details #> '{configurator_options,custom_fields}';
  component jsonb;
  field jsonb;
  ids text[] := array[]::text[];
  total numeric := 0;
begin
  if composition is not null and composition <> 'null'::jsonb then
    if jsonb_typeof(composition) is distinct from 'object' or composition ->> 'version' is distinct from '1' or coalesce(composition ->> 'mode','') not in ('manual','composition')
      or jsonb_typeof(composition -> 'components') is distinct from 'array'
      or jsonb_array_length(composition -> 'components') > 100 then
      raise exception 'Invalid product cost composition' using errcode = '23514';
    end if;
    for component in select value from jsonb_array_elements(composition -> 'components') loop
      if coalesce(component ->> 'id','') = '' or component ->> 'id' = any(ids)
        or btrim(coalesce(component ->> 'description','')) = ''
        or btrim(coalesce(component ->> 'type','')) = '' or btrim(coalesce(component ->> 'unit','')) = ''
        or jsonb_typeof(component -> 'quantity') is distinct from 'number'
        or jsonb_typeof(component -> 'unit_cost') is distinct from 'number'
        or jsonb_typeof(component -> 'active') is distinct from 'boolean'
        or (component ->> 'quantity')::numeric < 0 or (component ->> 'unit_cost')::numeric < 0 then
        raise exception 'Invalid product cost component' using errcode = '23514';
      end if;
      ids := array_append(ids, component ->> 'id');
      if coalesce(component ->> 'supplier_id','') <> '' and not exists (
        select 1 from public.suppliers s where s.id = component ->> 'supplier_id' and s.company_id = new.company_id
      ) then raise exception 'Cost supplier must belong to product company' using errcode = '23514'; end if;
      if (component ->> 'active')::boolean then total := total + (component ->> 'quantity')::numeric * (component ->> 'unit_cost')::numeric; end if;
    end loop;
    if composition ->> 'mode' = 'composition' then new.base_cost := round(total, 2); end if;
  end if;
  ids := array[]::text[];
  if fields is not null and fields <> 'null'::jsonb then
    if jsonb_typeof(fields) is distinct from 'array' or jsonb_array_length(fields) > 30 then
      raise exception 'Invalid product fields' using errcode = '23514';
    end if;
    for field in select value from jsonb_array_elements(fields) loop
      if coalesce(field ->> 'id','') = '' or field ->> 'id' = any(ids)
        or btrim(coalesce(field ->> 'label','')) = '' or length(field ->> 'label') > 100
        or coalesce(field ->> 'type','') not in ('text','textarea','number','select','checkbox','date','measure')
        or jsonb_typeof(field -> 'required') is distinct from 'boolean' then
        raise exception 'Invalid product field definition' using errcode = '23514';
      end if;
      ids := array_append(ids, field ->> 'id');
      if field ->> 'type' = 'select' then
        if jsonb_typeof(field -> 'options') is distinct from 'array' or jsonb_array_length(field -> 'options') = 0 then
          raise exception 'Product field requires options' using errcode = '23514';
        end if;
        if exists (select 1 from jsonb_array_elements(field -> 'options') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '')
          or (select count(*) <> count(distinct value) from jsonb_array_elements(field -> 'options')) then
          raise exception 'Product field options must be unique nonempty strings' using errcode = '23514';
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_product_configuration() from public, anon, authenticated;
create trigger validate_product_configuration before insert or update of pricing_details, base_cost
on public.products for each row execute function private.validate_product_configuration();

-- Existing product.price_changed audit trigger sees the derived base_cost and
-- configuration fingerprint. No new audit trigger and no historical repricing.
