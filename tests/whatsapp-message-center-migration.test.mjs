import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260802023400_create_whatsapp_message_center.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('migration creates constrained tenant tables and indexes without data DML', () => {
  assert.match(sql, /create table public\.whatsapp_message_templates/i);
  assert.match(sql, /create table public\.whatsapp_settings/i);
  assert.match(sql, /unique \(company_id, event_key\)/i);
  assert.match(sql, /char_length\(trim\(content\)\) between 1 and 4000/i);
  assert.match(sql, /open_mode in \('auto', 'web', 'app'\)/i);
  assert.match(sql, /whatsapp_message_templates_company_active_idx/i);
  assert.doesNotMatch(sql, /\b(insert into|update public\.|delete from)\b/i);
});

test('migration enables RLS and blocks anon and PUBLIC', () => {
  assert.match(sql, /alter table public\.whatsapp_message_templates enable row level security/i);
  assert.match(sql, /alter table public\.whatsapp_settings enable row level security/i);
  assert.match(sql, /revoke all on table public\.whatsapp_message_templates from public, anon/i);
  assert.match(sql, /revoke all on table public\.whatsapp_settings from public, anon/i);
  assert.doesNotMatch(sql, /\bto anon\b|\bto public\b/i);
});

test('every operation is isolated by current company and mutations require managers', () => {
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`whatsapp_message_templates_tenant_${operation}`));
    assert.match(sql, new RegExp(`whatsapp_settings_tenant_${operation}`));
  }
  assert.ok((sql.match(/private\.current_company_id\(\)/gi) || []).length >= 8);
  assert.ok((sql.match(/private\.current_user_role\(\)[\s\S]{0,100}admin[\s\S]{0,30}gerente/gi) || []).length >= 6);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /security definer/i);
});
