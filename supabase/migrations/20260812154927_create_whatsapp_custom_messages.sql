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

create or replace function private.current_user_can_mutate_whatsapp_custom_messages(
  p_path text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with current_profile as (
    select p.company_id, p.role
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
    order by p.id
    limit 1
  )
  select coalesce((
    select case
      when p_path is distinct from '/whatsapp' then false
      when cp.role = 'admin' then true
      when cp.role = 'gerente' then coalesce((
        select 'gerente' = any(rp.roles)
        from public.role_permissions rp
        where rp.company_id = cp.company_id
          and rp.path = p_path
      ), true)
      else false
    end
    from current_profile cp
  ), false)
$$;

revoke all on function private.current_user_can_mutate_whatsapp_custom_messages(text)
from public, anon;
grant execute on function private.current_user_can_mutate_whatsapp_custom_messages(text)
to authenticated;

create policy whatsapp_custom_messages_tenant_select
on public.whatsapp_custom_messages for select to authenticated
using (company_id = (select private.current_company_id()));

create policy whatsapp_custom_messages_tenant_insert
on public.whatsapp_custom_messages for insert to authenticated
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_can_mutate_whatsapp_custom_messages('/whatsapp'))
);

create policy whatsapp_custom_messages_tenant_update
on public.whatsapp_custom_messages for update to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_can_mutate_whatsapp_custom_messages('/whatsapp'))
)
with check (
  company_id = (select private.current_company_id())
  and (select private.current_user_can_mutate_whatsapp_custom_messages('/whatsapp'))
);

create policy whatsapp_custom_messages_tenant_delete
on public.whatsapp_custom_messages for delete to authenticated
using (
  company_id = (select private.current_company_id())
  and (select private.current_user_can_mutate_whatsapp_custom_messages('/whatsapp'))
);

create or replace function public.update_whatsapp_custom_message_atomic(
  p_message_id text,
  p_name text,
  p_content text,
  p_context_type text,
  p_expected_updated_at timestamptz
)
returns table (
  result_status text,
  message_id text,
  message_company_id text,
  message_name text,
  message_content text,
  message_context_type text,
  message_created_at timestamptz,
  message_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_company_id text := private.current_company_id();
  v_message public.whatsapp_custom_messages%rowtype;
begin
  if v_company_id is null
    or not private.current_user_can_mutate_whatsapp_custom_messages('/whatsapp') then
    return query select
      'NOT_AUTHORIZED'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select m.*
  into v_message
  from public.whatsapp_custom_messages m
  where m.id = p_message_id
    and m.company_id = v_company_id
  for update;

  if not found then
    return query select
      'NOT_FOUND'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_message.updated_at is distinct from p_expected_updated_at then
    return query select
      'CONFLICT'::text,
      v_message.id, v_message.company_id, v_message.name, v_message.content,
      v_message.context_type, v_message.created_at, v_message.updated_at;
    return;
  end if;

  update public.whatsapp_custom_messages m
  set
    name = p_name,
    content = p_content,
    context_type = p_context_type
  where m.id = v_message.id
    and m.company_id = v_company_id
  returning m.* into v_message;

  if not found then
    return query select
      'NOT_AUTHORIZED'::text,
      null::text, null::text, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  return query select
    'UPDATED'::text,
    v_message.id, v_message.company_id, v_message.name, v_message.content,
    v_message.context_type, v_message.created_at, v_message.updated_at;
end;
$$;

revoke all on function public.update_whatsapp_custom_message_atomic(
  text, text, text, text, timestamptz
) from public, anon;
grant execute on function public.update_whatsapp_custom_message_atomic(
  text, text, text, text, timestamptz
) to authenticated;
