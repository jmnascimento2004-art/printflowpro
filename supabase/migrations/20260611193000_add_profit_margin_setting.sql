-- Adds default profit margin used by product pricing forms.
-- Safe additive migration: keeps existing settings and only fills missing values.

alter table public.settings
  add column if not exists profit_margin numeric(5,2) default 40.00;

update public.settings
set profit_margin = coalesce(profit_margin, 40.00);
