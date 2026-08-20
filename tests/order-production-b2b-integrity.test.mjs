import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const migration = await readFile(
  new URL('../supabase/migrations/20260820163000_order_production_b2b_integrity.sql', import.meta.url),
  'utf8'
);
const repairMigration = await readFile(
  new URL('../supabase/migrations/20260820174500_repair_missing_production_queue_ped_0024.sql', import.meta.url),
  'utf8'
);
const documentRepairMigration = await readFile(
  new URL('../supabase/migrations/20260820180000_repair_missing_production_queue_ped_0024_by_document.sql', import.meta.url),
  'utf8'
);
const context = await readFile(new URL('../src/context/database-context.tsx', import.meta.url), 'utf8');
const ordersPage = await readFile(new URL('../src/app/(dashboard)/orders/page.tsx', import.meta.url), 'utf8');

async function compile(path, requireMap = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('require', 'exports', 'module', output)((specifier) => requireMap[specifier] || {}, module.exports, module);
  return module.exports;
}

test('production entry is an explicit tenant-scoped idempotent server operation', () => {
  assert.match(migration, /private\.ensure_production_queue_for_order[\s\S]+on conflict \(company_id, order_item_id\) do nothing/i);
  assert.match(migration, /o\.status in \('producao', 'impressao', 'acabamento'\)/i);
  assert.match(migration, /security definer[\s\S]+set search_path = ''/i);
  assert.match(migration, /revoke all on function private\.ensure_production_queue_for_order[\s\S]+authenticated/i);
});

test('order save, explicit status transition and payment wrap queue creation in the server transaction', () => {
  for (const name of [
    'save_order_with_items_and_production',
    'transition_order_status_and_production',
    'record_order_payment_and_production'
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`, 'i'));
  }
  assert.match(migration, /public\.record_order_payment_phase4b[\s\S]+private\.ensure_production_queue_for_order/i);
  assert.match(migration, /public\.transition_order_status_phase4b[\s\S]+private\.ensure_production_queue_for_order/i);
  assert.match(migration, /public\.save_order_with_items_phase4b[\s\S]+private\.ensure_production_queue_for_order/i);
});

test('legacy and direct mutation paths cannot bypass the transactional production boundary', () => {
  for (const name of [
    'save_order_with_items_phase4b',
    'transition_order_status_phase4b',
    'record_order_payment_phase4b'
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+from authenticated`, 'i'));
  }
  assert.match(migration, /revoke insert, update on table public\.orders[\s\S]+authenticated/i);
  assert.match(migration, /revoke insert, update on table public\.order_items[\s\S]+authenticated/i);
});

test('wrappers return only inserted queue rows and never update a persisted stage', () => {
  assert.match(migration, /jsonb_build_object\('production', v_production\)/i);
  const helper = migration.match(/create or replace function private\.ensure_production_queue_for_order[\s\S]+?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(helper, /set[\s\S]{0,300}status\s*=/i);
  assert.doesNotMatch(context, /from\(['"]production_queue['"]\)\.upsert/i);
  assert.doesNotMatch(context, /injectProductionQueue|createProductionQueueItemsForOrder|productionStatusForOrder/);
});

test('explicit saves refresh only denormalized production fields and return inserts only', () => {
  const helper = migration.match(/create or replace function private\.ensure_production_queue_for_order[\s\S]+?\$\$;/i)?.[0] || '';
  assert.match(helper, /update public\.production_queue q[\s\S]+order_number = o\.number[\s\S]+product_name = i\.product_name[\s\S]+quantity = i\.quantity[\s\S]+deadline = o\.deadline/i);
  assert.doesNotMatch(helper, /set[\s\S]{0,300}(status|priority|responsible_name|completed_at)\s*=/i);
  assert.match(helper, /return query[\s\S]+insert into public\.production_queue[\s\S]+on conflict \(company_id, order_item_id\) do nothing[\s\S]+returning \*/i);
});

test('aggregate order persistence keeps stable item identities and deletes only removed items', () => {
  const save = migration.match(/create or replace function public\.save_order_with_items\([\s\S]+?\$\$;/i)?.[0] || '';
  assert.match(save, /on conflict \(id\) do update set[\s\S]+where public\.order_items\.order_id = v_order_id/i);
  assert.match(save, /delete from public\.order_items oi[\s\S]+not \(oi\.id = any\(v_keep_item_ids\)\)/i);
  assert.doesNotMatch(save, /delete from public\.order_items oi where oi\.order_id = v_order_id;/i);
  assert.match(save, /ORDER_ITEM_ID_REQUIRED/i);
  assert.doesNotMatch(save, /clock_timestamp\(\)::text/i);
});

test('B2B exposure is aggregated server-side with tenant and authorization gates', () => {
  const fn = migration.match(/create or replace function public\.get_b2b_credit_exposure\(\)[\s\S]+?\$\$;/i)?.[0] || '';
  assert.match(fn, /private\.current_company_id\(\)/i);
  assert.match(fn, /current_user_can_access_path\('\/orders'\)/i);
  assert.match(fn, /o\.company_id = v_company_id/i);
  assert.match(fn, /c\.billing_type = 'faturado'/i);
  assert.match(fn, /f\.type = 'receita'[\s\S]+f\.status = 'pago'/i);
  assert.match(fn, /greatest\(coalesce\(o\.paid_amount, 0\), p\.paid_amount\)/i);
  assert.match(fn, /not in \('cancelado', 'cancelada', 'cancelled', 'canceled'\)/i);
});

test('legacy PED and ORD transaction links are normalized only as a fallback to order_id', () => {
  const fn = migration.match(/create or replace function public\.get_b2b_credit_exposure\(\)[\s\S]+?\$\$;/i)?.[0] || '';
  assert.match(fn, /f\.order_id = o\.id[\s\S]+f\.order_id is null/i);
  assert.match(fn, /when btrim\(coalesce\(f\.order_number, ''\)\) ~\* '\^ORD-'/i);
  assert.match(fn, /'ped-' \|\| lower\(substr/i);
  assert.match(migration, /financial_transactions_company_legacy_order_paid_idx/i);
  assert.match(fn, /left join lateral[\s\S]+union all/i);
});

test('Orders KPI loads the aggregate RPC and contains no client-side B2B reduction', () => {
  assert.match(ordersPage, /getB2BCreditExposure\(\)/);
  assert.match(ordersPage, /b2bExposureRequestRef/);
  assert.match(ordersPage, /setB2BExposureStatus\('loading'\)/);
  assert.match(ordersPage, /setB2BExposureStatus\('error'\)/);
  assert.match(ordersPage, /'Indisponível'/);
  assert.doesNotMatch(ordersPage, /const corporateB2BFaturado = activeOrders\.reduce/);
});

test('B2B service maps one finite non-negative server value', async () => {
  const service = await compile('../src/lib/finance/b2b-credit-exposure-service.ts', {
    '@/lib/supabaseClient': { supabase: {} }
  });
  const calls = [];
  const client = {
    rpc(name) {
      calls.push(name);
      return Promise.resolve({ data: '747.32', error: null });
    }
  };
  assert.equal(await service.getB2BCreditExposure(client), 747.32);
  assert.deepEqual(calls, ['get_b2b_credit_exposure']);
});

test('B2B service fails closed for server errors and malformed values', async () => {
  const service = await compile('../src/lib/finance/b2b-credit-exposure-service.ts', {
    '@/lib/supabaseClient': { supabase: {} }
  });
  await assert.rejects(service.getB2BCreditExposure({ rpc: async () => ({ data: null, error: { code: '42501' } }) }));
  await assert.rejects(service.getB2BCreditExposure({ rpc: async () => ({ data: '-1', error: null }) }));
});

test('the confirmed production gap repair is exact, idempotent and never rewrites an existing stage', () => {
  assert.match(repairMigration, /lower\(btrim\(c\.name\)\) = 'cibeleprint'/i);
  assert.match(repairMigration, /upper\(btrim\(o\.number\)\) = 'PED-0024'/i);
  assert.match(repairMigration, /v_candidate_count <> 1[\s\S]+TARGET_AMBIGUOUS/i);
  assert.match(repairMigration, /v_existing_count = v_item_count[\s\S]+ALREADY_COMPLETE/i);
  assert.match(repairMigration, /v_existing_count <> 0[\s\S]+PARTIAL_STATE/i);
  assert.match(repairMigration, /private\.ensure_production_queue_for_order\(v_order_id, v_company_id\)/i);
  assert.match(repairMigration, /production\.queue_repaired/i);
  assert.doesNotMatch(repairMigration, /update\s+public\.production_queue|delete\s+from\s+public\.production_queue/i);
});

test('the canonical-document repair targets only CibelePRINT PED-0024 and fails closed', () => {
  assert.match(documentRepairMigration, /regexp_replace\(coalesce\(c\.document, ''\), '\\D', '', 'g'\) = '30807938000189'/i);
  assert.match(documentRepairMigration, /upper\(btrim\(o\.number\)\) = 'PED-0024'/i);
  assert.match(documentRepairMigration, /v_candidate_count = 0[\s\S]+TARGET_NOT_PRESENT_BY_DOCUMENT[\s\S]+return/i);
  assert.match(documentRepairMigration, /v_candidate_count <> 1[\s\S]+TARGET_AMBIGUOUS_BY_DOCUMENT/i);
  assert.match(documentRepairMigration, /v_existing_count = v_item_count[\s\S]+ALREADY_COMPLETE_BY_DOCUMENT/i);
  assert.match(documentRepairMigration, /v_existing_count <> 0[\s\S]+PARTIAL_STATE/i);
  assert.match(documentRepairMigration, /private\.ensure_production_queue_for_order\(v_order_id, v_company_id\)/i);
  assert.match(documentRepairMigration, /production\.queue_repaired/i);
  assert.doesNotMatch(documentRepairMigration, /update\s+public\.production_queue|delete\s+from\s+public\.production_queue/i);
});
