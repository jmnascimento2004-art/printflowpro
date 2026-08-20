import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('require', 'exports', 'module', output)((specifier) => requireMap[specifier] || {}, module.exports, module);
  return module.exports;
}

const service = await compile('../src/lib/persistence/persistence-service.ts', {
  '@/lib/supabaseClient': { supabase: {} }
});

function rpcClient(response) {
  const calls = [];
  return {
    calls,
    client: {
      rpc(name, args) {
        calls.push({ name, args });
        return Promise.resolve(response);
      }
    }
  };
}

test('inventory adjustment is a single server command and does not accept a browser company id', async () => {
  const mock = rpcClient({ data: { status: 'UPDATED', product: { id: 'p1' }, movement: { id: 'm1' } }, error: null });
  const result = await service.adjustInventoryStock({
    productId: 'p1', quantity: 3, type: 'saida', reason: 'Pedido', expectedUpdatedAt: 'v1'
  }, mock.client);
  assert.equal(result.movement.id, 'm1');
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].name, 'adjust_inventory_stock');
  assert.equal('p_company_id' in mock.calls[0].args, false);
  assert.equal(mock.calls[0].args.p_expected_updated_at, 'v1');
});

test('stale inventory command exposes the latest row instead of overwriting it', async () => {
  const latest = { id: 'p1', current_stock: 9, updated_at: 'v2' };
  const mock = rpcClient({ data: { status: 'CONFLICT', product: latest }, error: null });
  await assert.rejects(
    service.adjustInventoryStock({ productId: 'p1', quantity: 1, type: 'saida', reason: 'x', expectedUpdatedAt: 'v1' }, mock.client),
    (error) => error.code === 'CONFLICT' && error.latest.current_stock === 9
  );
});

test('cash operation is atomic and carries the session concurrency token', async () => {
  const mock = rpcClient({ data: { status: 'UPDATED', session: { id: 's1' }, transaction: { id: 't1' } }, error: null });
  await service.operateCashRegister({ operation: 'sangria', amount: 10, description: 'Troco', expectedUpdatedAt: 'v4' }, mock.client);
  assert.equal(mock.calls[0].name, 'operate_cash_register');
  assert.equal(mock.calls[0].args.p_expected_updated_at, 'v4');
});

test('order payment is one RPC for order, finance, customer and cash side effects', async () => {
  const mock = rpcClient({ data: {
    status: 'UPDATED', order: { id: 'o1' }, financial: { id: 'f1' }, session: { id: 's1' }, register_transaction: { id: 'r1' },
    production: [{ id: 'q1' }]
  }, error: null });
  const result = await service.recordOrderPayment({ orderId: 'o1', amount: 50, method: 'pix', expectedUpdatedAt: 'v1' }, mock.client);
  assert.equal(result.financial.id, 'f1');
  assert.equal(result.registerTransaction.id, 'r1');
  assert.equal(mock.calls.length, 1);
  assert.equal(result.production[0].id, 'q1');
  assert.equal(mock.calls[0].name, 'record_order_payment_and_production');
});

test('shipment and order transitions use server commands with CAS', async () => {
  const shipmentMock = rpcClient({ data: { status: 'UPDATED', shipment: { id: 's1' } }, error: null });
  await service.transitionShipment({ shipmentId: 's1', status: 'enviado', expectedUpdatedAt: 'v1' }, shipmentMock.client);
  assert.equal(shipmentMock.calls[0].name, 'transition_shipment');
  const orderMock = rpcClient({ data: { status: 'UPDATED', order: { id: 'o1' }, shipment: { id: 's1' }, production: [] }, error: null });
  const orderResult = await service.transitionOrderStatus({ orderId: 'o1', status: 'expedicao', expectedUpdatedAt: 'v2' }, orderMock.client);
  assert.deepEqual(orderResult.production, []);
  assert.equal(orderMock.calls[0].name, 'transition_order_status_and_production');
});

test('role permissions are an explicit legitimate bulk command with version map', async () => {
  const mock = rpcClient({ data: { status: 'UPDATED', permissions: [{ path: '/stock', roles: ['admin'] }] }, error: null });
  const result = await service.saveRolePermissions({ '/stock': ['admin'] }, { '/stock': 'v1' }, mock.client);
  assert.equal(result.length, 1);
  assert.deepEqual(mock.calls[0].args.p_expected_versions, { '/stock': 'v1' });
});

test('database context contains no collection snapshot upsert effects', async () => {
  const context = await readFile(new URL('../src/context/database-context.tsx', import.meta.url), 'utf8');
  const forbidden = [
    /\.upsert\(suppliers\)/, /\.upsert\(categories\)/, /\.upsert\(products\)/,
    /\.upsert\(financial\)/, /\.upsert\(shipments\)/, /\.upsert\(stockMovements\)/,
    /\.upsert\(pickupPoints\)/, /\.upsert\(banners\)/, /\.upsert\(sessions\)/,
    /\.upsert\(registerTransactions\)/
  ];
  forbidden.forEach((pattern) => assert.doesNotMatch(context, pattern));
  assert.match(context, /adjustInventoryStock<Product, StockMovement>/);
  assert.match(context, /recordOrderPayment<Order, FinancialTransaction/);
  assert.match(context, /saveRolePermissions<RolePermissionRow>/);
  assert.match(context, /rpc\('save_quote_with_items_phase4b'/);
  assert.match(context, /rpc\('save_order_with_items_and_production'/);
  assert.doesNotMatch(context, /rpc\('save_quote_with_items',/);
  assert.doesNotMatch(context, /rpc\('save_order_with_items',/);
});

test('migration hardens every SECURITY DEFINER command and derives tenant server-side', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260819130847_phase4b_global_persistence_integrity.sql', import.meta.url), 'utf8');
  const functions = [...sql.matchAll(/create or replace function (public|private)\.([a-z0-9_]+)\([\s\S]*?\n\$\$;/gi)];
  assert.ok(functions.length >= 8);
  for (const match of functions) {
    assert.match(match[0], /security definer/i, `${match[2]} must be SECURITY DEFINER`);
    assert.match(match[0], /set search_path = ''/i, `${match[2]} must pin search_path`);
  }
  assert.match(sql, /private\.current_company_id\(\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (public|anon)/i);
  assert.match(sql, /cash_register_one_open_session_per_company/i);
  assert.match(sql, /shipments_company_order_unique/i);
});

test('audit payload removes secrets and large image/address fields', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260819130847_phase4b_global_persistence_integrity.sql', import.meta.url), 'utf8');
  assert.match(sql, /- array\['company_id','created_at','updated_at','pix_key'\]/);
  assert.match(sql, /- array\['company_id','created_at','updated_at','image_url','mobile_image_url'\]/);
  assert.match(sql, /- array\['company_id','created_at','updated_at','address','customer_name'\]/);
  assert.doesNotMatch(sql, /service_role|password|access_token|refresh_token/i);
});
