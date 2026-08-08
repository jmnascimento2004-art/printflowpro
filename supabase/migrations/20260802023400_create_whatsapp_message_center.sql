create table public.whatsapp_message_templates (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  event_key text not null,
  name text not null,
  content text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_message_templates_company_event_unique unique (company_id, event_key),
  constraint whatsapp_message_templates_event_key_format check (event_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint whatsapp_message_templates_name_length check (char_length(trim(name)) between 1 and 120),
  constraint whatsapp_message_templates_content_length check (char_length(trim(content)) between 1 and 4000)
);

create index whatsapp_message_templates_company_idx
  on public.whatsapp_message_templates(company_id);

create index whatsapp_message_templates_company_active_idx
  on public.whatsapp_message_templates(company_id, active);

create trigger set_timestamp_whatsapp_message_templates
before update on public.whatsapp_message_templates
for each row execute procedure public.trigger_set_timestamp();

create table public.whatsapp_settings (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null unique references public.companies(id) on delete cascade,
  country_code text not null default '55',
  business_phone text,
  signature text,
  open_mode text not null default 'auto',
  confirm_before_open boolean not null default true,
  include_company_name boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint whatsapp_settings_country_code_format check (country_code ~ '^[0-9]{1,3}$'),
  constraint whatsapp_settings_business_phone_format check (business_phone is null or business_phone ~ '^[0-9]{10,15}$'),
  constraint whatsapp_settings_signature_length check (signature is null or char_length(signature) <= 500),
  constraint whatsapp_settings_open_mode_check check (open_mode in ('auto', 'web', 'app'))
);

create index whatsapp_settings_company_idx on public.whatsapp_settings(company_id);

create trigger set_timestamp_whatsapp_settings
before update on public.whatsapp_settings
for each row execute procedure public.trigger_set_timestamp();

alter table public.whatsapp_message_templates enable row level security;
alter table public.whatsapp_settings enable row level security;

revoke all on table public.whatsapp_message_templates from public, anon;
revoke all on table public.whatsapp_settings from public, anon;
grant select, insert, update, delete on table public.whatsapp_message_templates to authenticated;
grant select, insert, update, delete on table public.whatsapp_settings to authenticated;

create policy whatsapp_message_templates_tenant_select
on public.whatsapp_message_templates for select to authenticated
using (company_id = (select private.current_company_id()));

create policy whatsapp_message_templates_tenant_insert
on public.whatsapp_message_templates for insert to authenticated
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_message_templates_tenant_update
on public.whatsapp_message_templates for update to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_message_templates_tenant_delete
on public.whatsapp_message_templates for delete to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_settings_tenant_select
on public.whatsapp_settings for select to authenticated
using (company_id = (select private.current_company_id()));

create policy whatsapp_settings_tenant_insert
on public.whatsapp_settings for insert to authenticated
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_settings_tenant_update
on public.whatsapp_settings for update to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_settings_tenant_delete
on public.whatsapp_settings for delete to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);
