-- PRINTFLOWPRO - Padrao real de bandeiras, entregas e selos do rodape
-- Execute este arquivo inteiro no Supabase SQL Editor.
--
-- Importante:
-- Este SQL NAO usa imagens fake e NAO troca as imagens que voce ja enviou.
-- Ele pega as imagens reais ja salvas na tabela public.companies e:
-- 1) mantem ativos somente os itens escolhidos;
-- 2) desativa os itens removidos;
-- 3) copia as imagens reais para empresas que ainda estiverem sem imagem;
-- 4) grava essas mesmas imagens reais como DEFAULT das colunas para futuras empresas.

alter table public.companies
  add column if not exists show_payments_visa boolean default true,
  add column if not exists show_payments_mastercard boolean default true,
  add column if not exists show_payments_elo boolean default true,
  add column if not exists show_payments_hipercard boolean default true,
  add column if not exists show_payments_diners boolean default false,
  add column if not exists show_payments_amex boolean default false,
  add column if not exists show_payments_boleto boolean default false,
  add column if not exists show_payments_transferencia boolean default false,
  add column if not exists show_payments_pix boolean default true,
  add column if not exists show_delivery_sedex boolean default true,
  add column if not exists show_delivery_pac boolean default false,
  add column if not exists show_delivery_correios boolean default true,
  add column if not exists show_delivery_jadlog boolean default true,
  add column if not exists show_delivery_motoboy boolean default true,
  add column if not exists show_security_letsencrypt boolean default true,
  add column if not exists show_security_google boolean default true,
  add column if not exists img_payments_visa text,
  add column if not exists img_payments_mastercard text,
  add column if not exists img_payments_elo text,
  add column if not exists img_payments_hipercard text,
  add column if not exists img_payments_pix text,
  add column if not exists img_delivery_sedex text,
  add column if not exists img_delivery_correios text,
  add column if not exists img_delivery_jadlog text,
  add column if not exists img_delivery_motoboy text,
  add column if not exists img_security_letsencrypt text,
  add column if not exists img_security_google text;

alter table public.companies
  alter column show_payments_visa set default true,
  alter column show_payments_mastercard set default true,
  alter column show_payments_elo set default true,
  alter column show_payments_hipercard set default true,
  alter column show_payments_diners set default false,
  alter column show_payments_amex set default false,
  alter column show_payments_boleto set default false,
  alter column show_payments_transferencia set default false,
  alter column show_payments_pix set default true,
  alter column show_delivery_sedex set default true,
  alter column show_delivery_pac set default false,
  alter column show_delivery_correios set default true,
  alter column show_delivery_jadlog set default true,
  alter column show_delivery_motoboy set default true,
  alter column show_security_letsencrypt set default true,
  alter column show_security_google set default true;

create table if not exists public.company_footer_badge_defaults (
  id text primary key default 'default',
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

with template as (
  select
    img_payments_visa,
    img_payments_mastercard,
    img_payments_elo,
    img_payments_hipercard,
    img_payments_pix,
    img_delivery_sedex,
    img_delivery_correios,
    img_delivery_jadlog,
    img_delivery_motoboy,
    img_security_letsencrypt,
    img_security_google
  from public.companies
  where nullif(img_payments_visa, '') is not null
     or nullif(img_payments_mastercard, '') is not null
     or nullif(img_payments_elo, '') is not null
     or nullif(img_payments_hipercard, '') is not null
     or nullif(img_payments_pix, '') is not null
     or nullif(img_delivery_sedex, '') is not null
     or nullif(img_delivery_correios, '') is not null
     or nullif(img_delivery_jadlog, '') is not null
     or nullif(img_delivery_motoboy, '') is not null
     or nullif(img_security_letsencrypt, '') is not null
     or nullif(img_security_google, '') is not null
  order by updated_at desc nulls last, created_at desc nulls last, id asc
  limit 1
)
insert into public.company_footer_badge_defaults (
  id,
  img_payments_visa,
  img_payments_mastercard,
  img_payments_elo,
  img_payments_hipercard,
  img_payments_pix,
  img_delivery_sedex,
  img_delivery_correios,
  img_delivery_jadlog,
  img_delivery_motoboy,
  img_security_letsencrypt,
  img_security_google,
  updated_at
)
select
  'default',
  img_payments_visa,
  img_payments_mastercard,
  img_payments_elo,
  img_payments_hipercard,
  img_payments_pix,
  img_delivery_sedex,
  img_delivery_correios,
  img_delivery_jadlog,
  img_delivery_motoboy,
  img_security_letsencrypt,
  img_security_google,
  now()
from template
on conflict (id) do update set
  img_payments_visa = excluded.img_payments_visa,
  img_payments_mastercard = excluded.img_payments_mastercard,
  img_payments_elo = excluded.img_payments_elo,
  img_payments_hipercard = excluded.img_payments_hipercard,
  img_payments_pix = excluded.img_payments_pix,
  img_delivery_sedex = excluded.img_delivery_sedex,
  img_delivery_correios = excluded.img_delivery_correios,
  img_delivery_jadlog = excluded.img_delivery_jadlog,
  img_delivery_motoboy = excluded.img_delivery_motoboy,
  img_security_letsencrypt = excluded.img_security_letsencrypt,
  img_security_google = excluded.img_security_google,
  updated_at = now();

with template as (
  select *
  from public.company_footer_badge_defaults
  where id = 'default'
)
update public.companies c
set
  show_payments_visa = true,
  show_payments_mastercard = true,
  show_payments_elo = true,
  show_payments_hipercard = true,
  show_payments_diners = false,
  show_payments_amex = false,
  show_payments_boleto = false,
  show_payments_transferencia = false,
  show_payments_pix = true,
  show_delivery_sedex = true,
  show_delivery_pac = false,
  show_delivery_correios = true,
  show_delivery_jadlog = true,
  show_delivery_motoboy = true,
  show_security_letsencrypt = true,
  show_security_google = true,
  img_payments_visa = coalesce(nullif(c.img_payments_visa, ''), template.img_payments_visa),
  img_payments_mastercard = coalesce(nullif(c.img_payments_mastercard, ''), template.img_payments_mastercard),
  img_payments_elo = coalesce(nullif(c.img_payments_elo, ''), template.img_payments_elo),
  img_payments_hipercard = coalesce(nullif(c.img_payments_hipercard, ''), template.img_payments_hipercard),
  img_payments_pix = coalesce(nullif(c.img_payments_pix, ''), template.img_payments_pix),
  img_delivery_sedex = coalesce(nullif(c.img_delivery_sedex, ''), template.img_delivery_sedex),
  img_delivery_correios = coalesce(nullif(c.img_delivery_correios, ''), template.img_delivery_correios),
  img_delivery_jadlog = coalesce(nullif(c.img_delivery_jadlog, ''), template.img_delivery_jadlog),
  img_delivery_motoboy = coalesce(nullif(c.img_delivery_motoboy, ''), template.img_delivery_motoboy),
  img_security_letsencrypt = coalesce(nullif(c.img_security_letsencrypt, ''), template.img_security_letsencrypt),
  img_security_google = coalesce(nullif(c.img_security_google, ''), template.img_security_google)
from template;

do $footer_badges$
declare
  d public.company_footer_badge_defaults%rowtype;
begin
  select *
  into d
  from public.company_footer_badge_defaults
  where id = 'default';

  if found then
    execute format('alter table public.companies alter column img_payments_visa set default %L', d.img_payments_visa);
    execute format('alter table public.companies alter column img_payments_mastercard set default %L', d.img_payments_mastercard);
    execute format('alter table public.companies alter column img_payments_elo set default %L', d.img_payments_elo);
    execute format('alter table public.companies alter column img_payments_hipercard set default %L', d.img_payments_hipercard);
    execute format('alter table public.companies alter column img_payments_pix set default %L', d.img_payments_pix);
    execute format('alter table public.companies alter column img_delivery_sedex set default %L', d.img_delivery_sedex);
    execute format('alter table public.companies alter column img_delivery_correios set default %L', d.img_delivery_correios);
    execute format('alter table public.companies alter column img_delivery_jadlog set default %L', d.img_delivery_jadlog);
    execute format('alter table public.companies alter column img_delivery_motoboy set default %L', d.img_delivery_motoboy);
    execute format('alter table public.companies alter column img_security_letsencrypt set default %L', d.img_security_letsencrypt);
    execute format('alter table public.companies alter column img_security_google set default %L', d.img_security_google);
  end if;
end;
$footer_badges$;

select
  'printflow_default_footer_badges_fix_ok' as status,
  count(*) as empresas_atualizadas
from public.companies;
