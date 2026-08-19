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

const service = await compile('../src/lib/production/production-service.ts', {
  '@/lib/supabaseClient': { supabase: {} }
});

const row = {
  id: 'queue-a', company_id: 'company-a', order_id: 'order-a', order_number: 'ORD-1',
  order_item_id: 'item-a', product_name: 'Banner', quantity: 2, status: 'fila', priority: 'media',
  deadline: '2026-08-20T12:00:00.000Z', responsible_name: null, started_at: null, finished_at: null,
  created_at: '2026-08-19T10:00:00.000Z', updated_at: '2026-08-19T10:00:00.000Z'
};

function atomic(status, source = row) {
  return {
    result_status: status,
    item_id: source?.id ?? null,
    item_company_id: source?.company_id ?? null,
    item_order_id: source?.order_id ?? null,
    item_order_number: source?.order_number ?? null,
    item_order_item_id: source?.order_item_id ?? null,
    item_product_name: source?.product_name ?? null,
    item_quantity: source?.quantity ?? null,
    item_status: source?.status ?? null,
    item_priority: source?.priority ?? null,
    item_deadline: source?.deadline ?? null,
    item_responsible_name: source?.responsible_name ?? null,
    item_started_at: source?.started_at ?? null,
    item_finished_at: source?.finished_at ?? null,
    item_created_at: source?.created_at ?? null,
    item_updated_at: source?.updated_at ?? null,
    audit_log_id: status === 'UPDATED' ? 'audit-a' : null
  };
}

function mockClient(response) {
  const calls = [];
  const state = { filters: [], payload: null, rpcName: null, rpcArguments: null, selection: null };
  const builder = {
    update(payload) { state.payload = payload; calls.push(['update', payload]); return builder; },
    eq(column, value) { state.filters.push([column, value]); calls.push(['eq', column, value]); return builder; },
    select(columns) { state.selection = columns; calls.push(['select', columns]); return builder; },
    single() { calls.push(['single']); return Promise.resolve(response); },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
  return {
    client: {
      rpc(name, args) { state.rpcName = name; state.rpcArguments = args; calls.push(['rpc', name, args]); return builder; },
      from(table) { calls.push(['from', table]); return builder; }
    }, calls, state
  };
}

test('stage transition performs one RPC with the exact concurrency token and no client company id', async () => {
  const saved = { ...row, status: 'producao', updated_at: '2026-08-19T10:01:00.000Z' };
  const mock = mockClient({ data: atomic('UPDATED', saved), error: null });
  const result = await service.transitionProductionStage(row.id, 'producao', row.updated_at, mock.client);
  assert.equal(result.status, 'producao');
  assert.equal(mock.state.rpcName, 'transition_production_stage');
  assert.deepEqual(mock.state.rpcArguments, {
    p_item_id: row.id, p_next_status: 'producao', p_expected_updated_at: row.updated_at
  });
  assert.equal('p_company_id' in mock.state.rpcArguments, false);
  assert.equal(mock.calls.filter(([name]) => name === 'rpc').length, 1);
});

test('unchanged server result returns the persisted row without inventing a version', async () => {
  const mock = mockClient({ data: atomic('UNCHANGED'), error: null });
  const result = await service.transitionProductionStage(row.id, 'fila', row.updated_at, mock.client);
  assert.equal(result.updated_at, row.updated_at);
});

test('stale transition maps to conflict and carries the newest persisted row', async () => {
  const latest = { ...row, status: 'impressao', updated_at: '2026-08-19T10:02:00.000Z' };
  const mock = mockClient({ data: atomic('CONFLICT', latest), error: null });
  await assert.rejects(
    service.transitionProductionStage(row.id, 'concluido', row.updated_at, mock.client),
    (error) => error.code === 'CONFLICT' && error.latestItem.status === 'impressao'
  );
});

test('missing row has a distinct NOT_FOUND outcome', async () => {
  const mock = mockClient({ data: atomic('NOT_FOUND', null), error: null });
  await assert.rejects(service.transitionProductionStage(row.id, 'producao', row.updated_at, mock.client), (error) => error.code === 'NOT_FOUND');
});

test('authorization denial has a distinct NOT_AUTHORIZED outcome', async () => {
  const mock = mockClient({ data: atomic('NOT_AUTHORIZED', null), error: null });
  await assert.rejects(service.transitionProductionStage(row.id, 'producao', row.updated_at, mock.client), (error) => error.code === 'NOT_AUTHORIZED');
});

test('invalid server outcome remains distinct', async () => {
  const mock = mockClient({ data: atomic('INVALID_STATUS', null), error: null });
  await assert.rejects(service.transitionProductionStage(row.id, 'producao', row.updated_at, mock.client), (error) => error.code === 'INVALID_STATUS');
});

test('missing expected version stops before any persistence call', async () => {
  let calls = 0;
  const client = { rpc() { calls += 1; throw new Error('must not run'); } };
  await assert.rejects(service.transitionProductionStage(row.id, 'producao', '', client), (error) => error.code === 'NOT_FOUND');
  assert.equal(calls, 0);
});

test('database authorization errors are safe and do not leak database messages', async () => {
  const mock = mockClient({ data: null, error: { code: '42501', message: 'private detail' } });
  await assert.rejects(
    service.transitionProductionStage(row.id, 'producao', row.updated_at, mock.client),
    (error) => error.code === 'NOT_AUTHORIZED' && !error.message.includes('private detail')
  );
});

test('responsible assignment updates only responsible_name with tenant, id and version filters', async () => {
  const saved = { ...row, responsible_name: 'Ana', updated_at: '2026-08-19T10:03:00.000Z' };
  const mock = mockClient({ data: saved, error: null });
  const result = await service.assignProductionResponsiblePersisted('company-a', row, ' Ana ', mock.client);
  assert.equal(result.responsible_name, 'Ana');
  assert.deepEqual(mock.state.payload, { responsible_name: 'Ana' });
  assert.deepEqual(mock.state.filters, [['id', row.id], ['company_id', 'company-a'], ['updated_at', row.updated_at]]);
  assert.equal('status' in mock.state.payload, false);
});

test('responsible assignment of an empty value persists null without moving the stage', async () => {
  const mock = mockClient({ data: { ...row, responsible_name: null }, error: null });
  await service.assignProductionResponsiblePersisted('company-a', row, '   ', mock.client);
  assert.deepEqual(mock.state.payload, { responsible_name: null });
});

test('responsible assignment rejects a stale row when no row is returned', async () => {
  const mock = mockClient({ data: null, error: null });
  await assert.rejects(service.assignProductionResponsiblePersisted('company-a', row, 'Ana', mock.client), (error) => error.code === 'CONFLICT');
});

test('queue creation uses one idempotent server RPC and maps only returned inserted rows', async () => {
  const mock = mockClient({ data: [row], error: null });
  const result = await service.ensureProductionQueueForOrder('order-a', mock.client);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'fila');
  assert.equal(mock.state.rpcName, 'ensure_production_queue_for_order');
  assert.deepEqual(mock.state.rpcArguments, { p_order_id: 'order-a' });
});

test('replaceProductionItem replaces by id and appends a realtime insertion once', () => {
  const updated = { ...row, status: 'producao' };
  assert.deepEqual(service.replaceProductionItem([row], updated), [updated]);
  assert.deepEqual(service.replaceProductionItem([], updated), [updated]);
});

test('replaceProductionItem ignores a delayed realtime row older than the current version', () => {
  const current = { ...row, status: 'concluido', updated_at: '2026-08-19T10:10:00.000Z' };
  const delayed = { ...row, status: 'producao', updated_at: '2026-08-19T10:09:00.000Z' };
  assert.strictEqual(service.replaceProductionItem([current], delayed)[0], current);
});

test('production context has no bulk queue upsert or order-derived phase overwrite', async () => {
  const context = await readFile(new URL('../src/context/database-context.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(context, /from\(['"]production_queue['"]\)\.upsert\(production\)/);
  assert.doesNotMatch(context, /createProductionQueueItemsForOrder|productionStatusForOrder/);
  assert.doesNotMatch(context, /p\.order_id === id \? \{ \.\.\.p, status: ['"]finalizado/);
  assert.match(context, /transitionProductionStage\(id, nextStatus, currentItem\.updated_at\)/);
});

test('production page uses a synchronous per-item lock before the first await', async () => {
  const page = await readFile(new URL('../src/app/(dashboard)/production/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /pendingItemIdsRef\.current\.has\(id\)[\s\S]+pendingItemIdsRef\.current\.add\(id\)/);
  assert.match(page, /if \(!id \|\| !beginItemMutation\(id\)\) return;[\s\S]+await updateProductionStatus/);
  assert.match(page, /finally \{[\s\S]+finishItemMutation\(id\)/);
});
