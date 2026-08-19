import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../supabase/migrations/20260819090000_create_operational_audit_log.sql', import.meta.url), 'utf8');
const auditTable = sql.match(/create table public\.audit_logs \([\s\S]+?\n\);/i)?.[0] || '';
const transition = sql.match(/create or replace function public\.transition_production_stage\([\s\S]+?\$\$;/i)?.[0] || '';
const ensureQueue = sql.match(/create or replace function public\.ensure_production_queue_for_order\([\s\S]+?\$\$;/i)?.[0] || '';
const permission = sql.match(/create or replace function private\.current_user_can_access_operational_path\([\s\S]+?\$\$;/i)?.[0] || '';

test('audit table contains tenant, actor snapshot, action, entity, old/new, metadata and timestamp fields', () => {
  for (const fragment of ['company_id text not null', 'actor_user_id uuid not null', 'actor_profile_id text', 'actor_name text not null', 'actor_role text not null', 'action text not null', 'entity_type text not null', 'entity_id text not null', 'module text not null', 'old_values jsonb not null', 'new_values jsonb not null', 'metadata jsonb not null', 'created_at timestamptz not null']) {
    assert.match(auditTable, new RegExp(fragment, 'i'));
  }
});

test('JSON audit payloads are constrained to structured objects', () => {
  assert.equal((auditTable.match(/jsonb_typeof\([^)]+\) = 'object'/gi) || []).length, 3);
});

test('audit table is RLS protected, tenant scoped and admin read-only', () => {
  assert.match(sql, /alter table public\.audit_logs enable row level security/i);
  assert.match(sql, /audit_logs_admin_tenant_select[\s\S]+company_id = \(select private\.current_company_id\(\)\)[\s\S]+current_user_role\(\)\) = 'admin'/i);
  assert.match(sql, /revoke all on table public\.audit_logs from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.audit_logs to authenticated/i);
});

test('application users receive no audit insert, update or delete privilege/policy', () => {
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[^;]+audit_logs[^;]+authenticated/i);
  assert.doesNotMatch(sql, /create policy audit_logs[^;]+for\s+(insert|update|delete)/i);
});

test('production permission helper is hardened and mirrors the operational route roles', () => {
  assert.match(permission, /security definer/i);
  assert.match(permission, /set search_path = ''/i);
  assert.match(permission, /auth\.uid\(\)/i);
  assert.match(permission, /p\.active = true/i);
  assert.match(permission, /p_path is distinct from '\/production'/i);
  assert.match(permission, /'gerente', 'producao', 'arte_finalista'/i);
});

test('stage transition is a hardened server transaction and is not callable by anon/public', () => {
  assert.match(transition, /security definer/i);
  assert.match(transition, /set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.transition_production_stage\(text, text, timestamptz\)[\s\S]+from public, anon/i);
  assert.match(sql, /grant execute on function public\.transition_production_stage\(text, text, timestamptz\)[\s\S]+to authenticated/i);
});

test('stage transition validates auth, tenant permission, supported status and tenant ownership', () => {
  assert.match(transition, /\(select auth\.uid\(\)\) is null/i);
  assert.match(transition, /current_user_can_access_operational_path\('\/production'\)/i);
  assert.match(transition, /p_next_status not in/i);
  assert.match(transition, /q\.company_id = v_actor\.company_id/i);
});

test('stage transition locks the row and rejects a stale updated_at', () => {
  assert.match(transition, /from public\.production_queue q[\s\S]+for update/i);
  assert.match(transition, /v_item\.updated_at is distinct from p_expected_updated_at/i);
  assert.match(transition, /'CONFLICT'::text/i);
});

test('one function updates the stage and appends exactly one structured audit event', () => {
  assert.equal((transition.match(/update public\.production_queue/gi) || []).length, 1);
  assert.equal((transition.match(/insert into public\.audit_logs/gi) || []).length, 1);
  assert.match(transition, /'production\.stage_changed'/i);
  assert.match(transition, /jsonb_build_object\('status', v_old_status\)/i);
  assert.match(transition, /jsonb_build_object\('status', v_item\.status\)/i);
});

test('unchanged stages do not fabricate audit history', () => {
  const unchangedPosition = transition.indexOf("'UNCHANGED'::text");
  const insertPosition = transition.indexOf('insert into public.audit_logs');
  assert.ok(unchangedPosition > 0 && insertPosition > unchangedPosition);
  assert.match(transition, /if v_item\.status = p_next_status then[\s\S]+return;[\s\S]+end if;/i);
});

test('initial queue creation is server-side, tenant-bound and idempotent', () => {
  assert.match(ensureQueue, /security definer/i);
  assert.match(ensureQueue, /o\.company_id = v_company_id/i);
  assert.match(ensureQueue, /join public\.order_items i on i\.order_id = o\.id/i);
  assert.match(ensureQueue, /on conflict \(company_id, order_item_id\) do nothing/i);
  assert.match(sql, /production_queue_company_order_item_unique[\s\S]+company_id, order_item_id/i);
});

test('initial stage derivation happens only during insert and never updates existing rows', () => {
  assert.match(ensureQueue, /case when o\.status in \('impressao', 'acabamento'\) then 'impressao' else 'fila' end/i);
  assert.doesNotMatch(ensureQueue, /\bupdate\s+public\.production_queue/i);
});

test('browser stage writes are revoked while responsible_name remains the only direct update column', () => {
  assert.match(sql, /revoke all on table public\.production_queue from authenticated/i);
  assert.match(sql, /grant delete on table public\.production_queue to authenticated/i);
  assert.match(sql, /grant update \(responsible_name\) on table public\.production_queue to authenticated/i);
  assert.doesNotMatch(sql, /create policy tenant_production_queue_delete/i);
});

test('migration preserves existing data and contains no backfill, repair, reset or destructive table operation', () => {
  assert.doesNotMatch(sql, /drop table|truncate|delete from|migration repair|include-all/i);
  assert.equal((sql.match(/drop constraint/gi) || []).length, 1);
  assert.equal((sql.match(/insert into public\.audit_logs/gi) || []).length, 1);
  assert.doesNotMatch(sql, /insert into public\.audit_logs[\s\S]+select[\s\S]+from public\.production_queue/i);
});

test('realtime publication is additive and duplicate-safe', () => {
  assert.match(sql, /alter publication supabase_realtime add table public\.production_queue/i);
  assert.match(sql, /when duplicate_object then null/i);
});

test('settings expose an admin-only read-only audit panel with required filters', async () => {
  const settings = await readFile(new URL('../src/app/(dashboard)/settings/page.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/settings/audit-log-panel.tsx', import.meta.url), 'utf8');
  assert.match(settings, /activeProfile\?\.role === 'admin'[\s\S]+Logs de Auditoria/);
  assert.match(panel, /Data inicial[\s\S]+Data final[\s\S]+Usuário[\s\S]+Módulo[\s\S]+Ação/);
  assert.doesNotMatch(panel, /\.insert\(|\.update\(|\.delete\(/);
});
