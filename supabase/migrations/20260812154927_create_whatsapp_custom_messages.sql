create table public.whatsapp_custom_messages (
  id text primary key default (gen_random_uuid()::text),
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  content text not null,
  context_type text not null default 'generic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_custom_messages_name_trimmed
    check (name = btrim(name)),
  constraint whatsapp_custom_messages_name_length
    check (char_length(name) between 1 and 120),
  constraint whatsapp_custom_messages_content_trimmed
    check (content = btrim(content)),
  constraint whatsapp_custom_messages_content_length
    check (char_length(content) between 1 and 4000),
  constraint whatsapp_custom_messages_context_type_check
    check (context_type in ('generic', 'customer'))
);

create unique index whatsapp_custom_messages_company_name_unique
  on public.whatsapp_custom_messages(company_id, lower(btrim(name)));

create index whatsapp_custom_messages_company_updated_idx
  on public.whatsapp_custom_messages(company_id, updated_at desc, id);

create trigger set_timestamp_whatsapp_custom_messages
before update on public.whatsapp_custom_messages
for each row execute procedure public.trigger_set_timestamp();

alter table public.whatsapp_custom_messages enable row level security;

revoke all on table public.whatsapp_custom_messages from public, anon;
grant select, insert, update, delete on table public.whatsapp_custom_messages to authenticated;

create policy whatsapp_custom_messages_tenant_select
on public.whatsapp_custom_messages for select to authenticated
using (company_id = (select private.current_company_id()));

create policy whatsapp_custom_messages_tenant_insert
on public.whatsapp_custom_messages for insert to authenticated
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_custom_messages_tenant_update
on public.whatsapp_custom_messages for update to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);

create policy whatsapp_custom_messages_tenant_delete
on public.whatsapp_custom_messages for delete to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_role()) in ('admin', 'gerente')
);
