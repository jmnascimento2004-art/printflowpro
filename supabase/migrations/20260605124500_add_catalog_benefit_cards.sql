-- PRINTFLOWPRO - extra catalog benefit cards
-- Safe additive migration. Does not remove existing data.

alter table public.companies
  add column if not exists card_benefits_5_title text default 'Entrega Garantida',
  add column if not exists card_benefits_5_subtitle text default 'Pedidos acompanhados até a entrega no endereço informado.',
  add column if not exists card_benefits_5_active boolean default false,
  add column if not exists card_benefits_6_title text default 'Melhor Custo Benefício',
  add column if not exists card_benefits_6_subtitle text default 'Preços competitivos com qualidade profissional em cada pedido.',
  add column if not exists card_benefits_6_active boolean default false,
  add column if not exists card_benefits_7_title text default 'Qualidade Garantida',
  add column if not exists card_benefits_7_subtitle text default 'Produção revisada para entregar acabamento e impressão de alto padrão.',
  add column if not exists card_benefits_7_active boolean default false;

update public.companies
set
  card_benefits_5_title = coalesce(card_benefits_5_title, 'Entrega Garantida'),
  card_benefits_5_subtitle = coalesce(card_benefits_5_subtitle, 'Pedidos acompanhados até a entrega no endereço informado.'),
  card_benefits_5_active = coalesce(card_benefits_5_active, false),
  card_benefits_6_title = coalesce(card_benefits_6_title, 'Melhor Custo Benefício'),
  card_benefits_6_subtitle = coalesce(card_benefits_6_subtitle, 'Preços competitivos com qualidade profissional em cada pedido.'),
  card_benefits_6_active = coalesce(card_benefits_6_active, false),
  card_benefits_7_title = coalesce(card_benefits_7_title, 'Qualidade Garantida'),
  card_benefits_7_subtitle = coalesce(card_benefits_7_subtitle, 'Produção revisada para entregar acabamento e impressão de alto padrão.'),
  card_benefits_7_active = coalesce(card_benefits_7_active, false);
