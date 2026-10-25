-- Cover the tenant-qualified consumption FK and tenant history reads.
create index component_consumption_parent on public.component_consumption_items(company_id,consumption_id);
