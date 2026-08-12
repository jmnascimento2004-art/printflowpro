import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260812154927_create_whatsapp_custom_messages.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const table = sql.match(/create table public\.whatsapp_custom_messages \([\s\S]+?\n\);/i)?.[0] || '';

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
  assert.ok((sql.match(/\(select private\.current_user_role\(\)\)[\s\S]{0,80}admin[\s\S]{0,30}gerente/gi) || []).length >= 4);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)|security definer/i);
});

test('migration contains no data seed, system storage, payment or financial change', () => {
  assert.doesNotMatch(sql, /\b(insert into|update public\.|delete from)\b/i);
  assert.doesNotMatch(sql, /whatsapp_message_templates|whatsapp_settings|payment_confirmation|financial_transactions/i);
});
