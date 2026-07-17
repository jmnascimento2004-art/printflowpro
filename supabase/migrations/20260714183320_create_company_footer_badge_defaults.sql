-- Historical prerequisite reconstructed from the linked production schema.
-- This table existed before 20260714183326_minimize_residual_public_grants.sql,
-- but its creation was missing from the local migration chain.

create table public.company_footer_badge_defaults (
  id text primary key default 'default'::text,
  img_payments_visa text,
  img_payments_mastercard text,
  img_payments_elo text,
  img_payments_hipercard text,
  img_payments_pix text,
  img_delivery_sedex text,
  img_delivery_correios text,
  img_delivery_jadlog text,
  img_delivery_motoboy text,
  img_security_letsencrypt text,
  img_security_google text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.company_footer_badge_defaults enable row level security;

revoke all privileges on table public.company_footer_badge_defaults from public, anon, authenticated;
grant all privileges on table public.company_footer_badge_defaults to service_role;
