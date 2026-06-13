-- PRINTFLOWPRO - add catalog promotions/highlights section toggle
-- Safe additive migration: preserves existing settings and enables the section by default.

alter table public.settings
  add column if not exists catalog_promotions_section_enabled boolean default true;

update public.settings
set catalog_promotions_section_enabled = true
where catalog_promotions_section_enabled is null;
