import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260819155635_global_audit_governance.sql', import.meta.url), 'utf8');
const panel = await readFile(new URL('../src/components/settings/audit-log-panel.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/lib/audit-log/audit-log-service.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../src/app/api/audit-logs/export/route.ts', import.meta.url), 'utf8');
const format = await readFile(new URL('../src/lib/audit-log/audit-log-format.ts', import.meta.url), 'utf8');
const matrix = await readFile(new URL('../docs/phase4e-audit-coverage-matrix.md', import.meta.url), 'utf8');

test('global audit migration preserves append-only RLS and supports explicit SYSTEM actors', () => {
  assert.match(migration, /alter column actor_user_id drop not null/i);
  assert.match(migration, /actor_name = 'SYSTEM' and actor_role = 'system'/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[^;]+audit_logs[^;]+authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+audit_logs[^;]+for\s+(insert|update|delete)/i);
  assert.match(migration, /revoke all on table public\.audit_logs from service_role/i);
  assert.match(migration, /audit_logs_company_id_fkey[\s\S]+on delete restrict/i);
});

test('the authoritative trigger validates actor and tenant with a pinned search path', () => {
  assert.match(migration, /create or replace function private\.phase4b_audit_business_mutation\(\)[\s\S]+security definer[\s\S]+set search_path = ''/i);
  assert.match(migration, /v_actor_user_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /PHASE4E_ACTOR_NOT_AUTHORIZED/i);
  assert.match(migration, /PHASE4E_TENANT_MISMATCH/i);
  assert.match(migration, /auth\.jwt\(\) ->> 'role'\)[\s\S]+<> 'service_role'/i);
});

test('critical modules and previously missing business tables are trigger-covered', () => {
  for (const table of [
    'suppliers', 'profiles', 'products', 'quotes', 'orders', 'production_queue',
    'financial_transactions', 'stock_movements', 'shipments', 'role_permissions',
    'whatsapp_message_templates', 'whatsapp_settings', 'whatsapp_custom_messages'
  ]) assert.match(migration, new RegExp(`'${table}'`, 'i'));
  assert.match(migration, /v_optional_tables constant text\[\] := array\['company_default_services'\]/i);
  assert.match(migration, /to_regclass\(pg_catalog\.format\('public\.%I', v_table\)\) is null[\s\S]+v_table = any\(v_optional_tables\)[\s\S]+continue[\s\S]+PHASE4E_REQUIRED_TABLE_MISSING/i);
});

test('price, permissions, PIX and operational transitions have meaningful event keys', () => {
  for (const event of [
    'product.price_changed', 'user.role_changed', 'user.permission_changed',
    'settings.pix_updated', 'production.responsible_changed', 'quote.approved',
    'financial.payment_changed', 'inventory.adjusted', 'whatsapp.configuration_changed'
  ]) assert.match(migration, new RegExp(event.replace('.', '\\.'), 'i'));
});

test('sensitive fields and large content are excluded or fingerprinted', () => {
  assert.match(migration, /pix_key_configured/i);
  assert.match(migration, /content_fingerprint/i);
  assert.match(migration, /content_length/i);
  assert.match(migration, /sensitive_configuration_changed/i);
  assert.doesNotMatch(migration, /jsonb_each\(v_(?:old|new)\)[\s\S]{0,300}item\.key not in/i);
  assert.match(migration, /'image_url','mobile_image_url'/i);
});

test('rich aggregate events suppress only their matching generic table triggers', () => {
  assert.match(migration, /create constraint trigger phase4b_audit_business_mutation[\s\S]+deferrable initially deferred/i);
  assert.match(migration, /tg_table_name in \('quotes', 'orders'\)[\s\S]+phase4b_explicit_command[\s\S]+txid_current\(\)/i);
  assert.doesNotMatch(migration, /audit_skip_tables/i);
});

test('audit list is server-paginated and supports all governance filters', () => {
  assert.match(service, /\.range\(offset, offset \+ trustedPageSize - 1\)/);
  assert.match(service, /count: 'exact'/);
  for (const filter of ['actorName', 'module', 'action', 'entityId']) assert.match(service, new RegExp(filter));
  assert.doesNotMatch(service, /\.limit\(200\)/);
});

test('administrative UI exposes filters, readable details, pagination and CSV', () => {
  for (const label of ['Data inicial', 'Data final', 'Usuário', 'Módulo', 'Ação', 'Identificador da entidade', 'Exportar CSV', 'Detalhes', 'Anterior', 'Próxima']) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /loadRequestRef/);
  assert.match(panel, /requestId !== loadRequestRef\.current/);
  assert.doesNotMatch(panel, /\.(insert|update|delete)\(/);
  assert.match(format, /'whatsapp\.template_deleted': 'Template WhatsApp removido'/);
});

test('CSV export is authenticated, RLS-backed, bounded and never uses service role', () => {
  assert.match(route, /client\.auth\.getUser\(token\)/);
  assert.match(route, /\.from\('audit_logs'\)/);
  assert.match(route, /offset < 5000/);
  assert.match(route, /Content-Disposition/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|server-admin/);
  assert.match(route, /\^\[=\+\\-@\\t\\r\]/);
});

test('coverage matrix classifies all requested modules and duplicate-derived tables', () => {
  for (const moduleLabel of ['Produção', 'Clientes', 'Produtos', 'Categorias', 'Catálogo', 'Orçamentos', 'Pedidos', 'Financeiro', 'Estoque', 'Expedição', 'PDV/Caixa', 'Fornecedores', 'Pontos de coleta', 'Usuários', 'Permissões', 'WhatsApp']) {
    assert.match(matrix, new RegExp(moduleLabel));
  }
  assert.match(matrix, /NOT_REQUIRED/);
  assert.match(matrix, /SYSTEM_ONLY/);
  assert.match(matrix, /append-only/i);
});
