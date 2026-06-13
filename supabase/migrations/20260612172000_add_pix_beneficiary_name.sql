-- PRINTFLOWPRO - add PIX beneficiary display name to financial settings
-- Safe additive migration: preserves existing settings and fills blank values from company names.

alter table public.settings
  add column if not exists pix_beneficiary_name text;

update public.settings s
set pix_beneficiary_name = c.name
from public.companies c
where s.company_id = c.id
  and (s.pix_beneficiary_name is null or s.pix_beneficiary_name = '');
