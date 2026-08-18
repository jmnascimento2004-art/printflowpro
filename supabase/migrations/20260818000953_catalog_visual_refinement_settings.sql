-- PRINTFLOWPRO - catalog visual refinement settings
-- Additive and backward-compatible: keeps the seven existing benefit-card slots
-- and the legacy promotions toggle while adding only the missing presentation data.

alter table public.companies
  add column if not exists card_benefits_1_icon text default 'credit-card',
  add column if not exists card_benefits_1_sort_order smallint default 1,
  add column if not exists card_benefits_2_icon text default 'percent',
  add column if not exists card_benefits_2_sort_order smallint default 2,
  add column if not exists card_benefits_3_icon text default 'truck',
  add column if not exists card_benefits_3_sort_order smallint default 3,
  add column if not exists card_benefits_4_icon text default 'map-pin',
  add column if not exists card_benefits_4_sort_order smallint default 4,
  add column if not exists card_benefits_5_icon text default 'package-check',
  add column if not exists card_benefits_5_sort_order smallint default 5,
  add column if not exists card_benefits_6_icon text default 'badge-dollar-sign',
  add column if not exists card_benefits_6_sort_order smallint default 6,
  add column if not exists card_benefits_7_icon text default 'shield-check',
  add column if not exists card_benefits_7_sort_order smallint default 7;

update public.companies
set
  card_benefits_1_icon = coalesce(card_benefits_1_icon, 'credit-card'),
  card_benefits_1_sort_order = coalesce(card_benefits_1_sort_order, 1),
  card_benefits_2_icon = coalesce(card_benefits_2_icon, 'percent'),
  card_benefits_2_sort_order = coalesce(card_benefits_2_sort_order, 2),
  card_benefits_3_icon = coalesce(card_benefits_3_icon, 'truck'),
  card_benefits_3_sort_order = coalesce(card_benefits_3_sort_order, 3),
  card_benefits_4_icon = coalesce(card_benefits_4_icon, 'map-pin'),
  card_benefits_4_sort_order = coalesce(card_benefits_4_sort_order, 4),
  card_benefits_5_icon = coalesce(card_benefits_5_icon, 'package-check'),
  card_benefits_5_sort_order = coalesce(card_benefits_5_sort_order, 5),
  card_benefits_6_icon = coalesce(card_benefits_6_icon, 'badge-dollar-sign'),
  card_benefits_6_sort_order = coalesce(card_benefits_6_sort_order, 6),
  card_benefits_7_icon = coalesce(card_benefits_7_icon, 'shield-check'),
  card_benefits_7_sort_order = coalesce(card_benefits_7_sort_order, 7);

alter table public.settings
  add column if not exists catalog_bestsellers_section_enabled boolean default true,
  add column if not exists catalog_highlights_section_enabled boolean;

-- The previous UI used catalog_promotions_section_enabled for the combined
-- Promotions/Highlights block. Seed the new Highlights toggle from that exact
-- value so deploying this migration does not change the visible catalog.
update public.settings
set
  catalog_bestsellers_section_enabled = coalesce(catalog_bestsellers_section_enabled, true),
  catalog_highlights_section_enabled = coalesce(
    catalog_highlights_section_enabled,
    catalog_promotions_section_enabled,
    true
  );

alter table public.settings
  alter column catalog_highlights_section_enabled set default true;
