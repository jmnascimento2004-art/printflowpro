-- PRINTFLOWPRO - catalog settings fields
-- Safe additive migration. Does not remove or overwrite existing data.

alter table public.settings
  add column if not exists catalog_header_message text,
  add column if not exists catalog_whatsapp text,
  add column if not exists free_pickup_alert boolean default true,
  add column if not exists catalog_footer_text text;

update public.settings
set free_pickup_alert = true
where free_pickup_alert is null;
