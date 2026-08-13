import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260812154927_create_whatsapp_custom_messages.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const table = sql.match(/create table public\.whatsapp_custom_messages \([\s\S]+?\n\);/i)?.[0] || '';
const permissionHelper = sql.match(/create or replace function private\.current_user_can_mutate_whatsapp_custom_messages\([\s\S]+?\$\$;/i)?.[0] || '';
const atomicUpdate = sql.match(/create or replace function public\.update_whatsapp_custom_message_atomic\([\s\S]+?\$\$;/i)?.[0] || '';

test('migration creates only the approved custom-message fields and constraints', () => {
  assert.match(table, /id text primary key default \(gen_random_uuid\(\)::text\)/i);
  assert.match(table, /company_id text not null references public\.companies\(id\) on delete cascade/i);
  for (const field of ['name text not null', 'content text not null', "context_type text not null default 'generic'", 'created_at timestamptz not null default now()', 'updated_at timestamptz not null default now()']) {
    assert.match(table, new RegExp(field.replace(/[()]/g, '\\$&'), 'i'));
  }
  assert.match(table, /name = btrim\(name\)/i);
  assert.match(table, /char_length\(name\) between 1 and 120/i);
  assert.match(table, /content = btrim\(content\)/i);
  assert.match(table, /char_length\(content\) between 1 and 4000/i);
  assert.match(table, /context_type in \('generic', 'customer'\)/i);
  assert.doesNotMatch(table, /event_key|system_event|is_active|created_by|updated_by|\bactive\b/i);
});

test('migration enforces tenant-normalized names, ordering and the standard timestamp trigger', () => {
  assert.match(sql, /create unique index whatsapp_custom_messages_company_name_unique[\s\S]+company_id, lower\(btrim\(name\)\)/i);
  assert.match(sql, /create index whatsapp_custom_messages_company_updated_idx[\s\S]+company_id, updated_at desc, id/i);
  assert.match(sql, /create trigger set_timestamp_whatsapp_custom_messages[\s\S]+execute procedure public\.trigger_set_timestamp\(\)/i);
});

test('migration grants only authenticated access and enables tenant RLS for every operation', () => {
  assert.match(sql, /alter table public\.whatsapp_custom_messages enable row level security/i);
  assert.match(sql, /revoke all on table public\.whatsapp_custom_messages from public, anon/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.whatsapp_custom_messages to authenticated/i);
  assert.doesNotMatch(sql, /\bgrant\b[^;]+\bto\s+(anon|public)\b/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`whatsapp_custom_messages_tenant_${operation}`, 'i'));
  }
  assert.ok((sql.match(/\(select private\.current_company_id\(\)\)/gi) || []).length >= 5);
  assert.ok((sql.match(/private\.current_user_can_mutate_whatsapp_custom_messages\('\/whatsapp'\)/gi) || []).length >= 5);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)|security definer/i);
});

test('private permission helper mirrors the effective /whatsapp application rules', () => {
  assert.match(permissionHelper, /security invoker/i);
  assert.match(permissionHelper, /set search_path = pg_catalog/i);
  assert.match(permissionHelper, /p\.auth_user_id = auth\.uid\(\)/i);
  assert.match(permissionHelper, /p\.active = true/i);
  assert.match(permissionHelper, /from public\.profiles p/i);
  assert.match(permissionHelper, /from public\.role_permissions rp/i);
  assert.match(permissionHelper, /rp\.company_id = cp\.company_id/i);
  assert.match(permissionHelper, /p_path is distinct from '\/whatsapp' then false/i);
  assert.match(permissionHelper, /cp\.role = 'admin' then true/i);
  assert.match(permissionHelper, /cp\.role = 'gerente'[\s\S]+?'gerente' = any\(rp\.roles\)[\s\S]+?\), true\)/i);
  assert.match(permissionHelper, /else false/i);
  assert.match(sql, /revoke all on function private\.current_user_can_mutate_whatsapp_custom_messages\(text\)[\s\S]+?from public, anon/i);
  assert.match(sql, /grant execute on function private\.current_user_can_mutate_whatsapp_custom_messages\(text\)[\s\S]+?to authenticated/i);
});

test('mutation policies require the exact granular route while SELECT remains tenant-only', () => {
  const selectPolicy = sql.match(/create policy whatsapp_custom_messages_tenant_select[\s\S]+?;/i)?.[0] || '';
  assert.match(selectPolicy, /using \(company_id = \(select private\.current_company_id\(\)\)\)/i);
  assert.doesNotMatch(selectPolicy, /current_user_can_mutate_whatsapp_custom_messages/i);
  for (const operation of ['insert', 'update', 'delete']) {
    const policy = sql.match(new RegExp(`create policy whatsapp_custom_messages_tenant_${operation}[\\s\\S]+?;`, 'i'))?.[0] || '';
    assert.match(policy, /company_id = \(select private\.current_company_id\(\)\)/i);
    assert.match(policy, /current_user_can_mutate_whatsapp_custom_messages\('\/whatsapp'\)/i);
    assert.doesNotMatch(policy, /current_user_role\(\)[\s\S]+?in \('admin', 'gerente'\)/i);
  }
});

test('atomic update uses one invoker transaction with row locking and explicit outcomes', () => {
  assert.match(atomicUpdate, /security invoker/i);
  assert.match(atomicUpdate, /set search_path = pg_catalog/i);
  assert.doesNotMatch(atomicUpdate, /p_company_id/i);
  assert.match(atomicUpdate, /private\.current_company_id\(\)/i);
  assert.match(atomicUpdate, /current_user_can_mutate_whatsapp_custom_messages\('\/whatsapp'\)/i);
  assert.match(atomicUpdate, /from public\.whatsapp_custom_messages m[\s\S]+?for update/i);
  assert.match(atomicUpdate, /is distinct from p_expected_updated_at/i);
  for (const status of ['UPDATED', 'CONFLICT', 'NOT_FOUND', 'NOT_AUTHORIZED']) {
    assert.match(atomicUpdate, new RegExp(`'${status}'::text`, 'i'));
  }
  assert.match(sql, /revoke all on function public\.update_whatsapp_custom_message_atomic\([\s\S]+?\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.update_whatsapp_custom_message_atomic\([\s\S]+?\) to authenticated/i);
});

test('migration contains no seed, system storage, placeholder allowlist, payment or financial change', () => {
  assert.doesNotMatch(sql, /\b(insert into|delete from)\b/i);
  assert.equal((sql.match(/update public\.whatsapp_custom_messages/gi) || []).length, 1);
  assert.doesNotMatch(sql, /whatsapp_message_templates|whatsapp_settings|payment_confirmation|financial_transactions/i);
  assert.doesNotMatch(sql, /placeholder|allowed_variables|triple_brace/i);
});
