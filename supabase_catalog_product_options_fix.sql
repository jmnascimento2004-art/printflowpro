-- PRINTFLOWPRO - Correção para produtos aparecerem no Catálogo Online
-- Execute este SQL no Supabase SQL Editor.
-- Seguro e aditivo: não apaga tabelas, não remove produtos e não altera preços.

alter table public.products
  add column if not exists catalog_active boolean default true,
  add column if not exists variant_options jsonb default '[]'::jsonb,
  add column if not exists color_options jsonb default '[]'::jsonb;

alter table public.settings
  add column if not exists profit_margin numeric(5,2) default 40.00;

-- Corrige produtos antigos que usavam "Inativo/Bloquear venda".
-- A partir de agora, "active" fica liberado para uso interno do SaaS/PDV.
-- "catalog_active" passa a controlar se aparece ou não no Catálogo Online.
update public.products
set
  active = true,
  catalog_active = true,
  variant_options = coalesce(variant_options, '[]'::jsonb),
  color_options = coalesce(color_options, '[]'::jsonb)
where catalog_active is null
   or active is distinct from true;

update public.settings
set profit_margin = coalesce(profit_margin, 40.00);

select
  count(*) filter (where catalog_active is true) as produtos_visiveis_no_catalogo,
  count(*) as produtos_total
from public.products;
