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

const engine = await compile('../src/lib/whatsapp/template-engine.ts');
const contract = await compile('../src/lib/whatsapp/custom-message-contract.ts', { './template-engine': engine });
const service = await compile('../src/lib/whatsapp/custom-message-service.ts', {
  '@/lib/supabaseClient': { supabase: {} },
  './custom-message-contract': contract
});

const row = {
  id: 'message-a',
  company_id: 'company-a',
  name: 'Boas-vindas',
  content: 'Olá {{cliente.nome}}',
  context_type: 'customer',
  created_at: '2026-08-12T12:00:00.000Z',
  updated_at: '2026-08-12T12:00:00.000Z'
};

function atomicResult(result_status, source = row) {
  return {
    result_status,
    message_id: source?.id ?? null,
    message_company_id: source?.company_id ?? null,
    message_name: source?.name ?? null,
    message_content: source?.content ?? null,
    message_context_type: source?.context_type ?? null,
    message_created_at: source?.created_at ?? null,
    message_updated_at: source?.updated_at ?? null
  };
}

function mockClient(response) {
  const calls = [];
  const state = {
    operation: null,
    payload: null,
    filters: [],
    orders: [],
    selection: null,
    rpcName: null,
    rpcArguments: null
  };
  const builder = {
    select(columns) { state.selection = columns; calls.push(['select', columns]); return builder; },
    insert(payload) { state.operation = 'insert'; state.payload = payload; calls.push(['insert', payload]); return builder; },
    update(payload) { state.operation = 'update'; state.payload = payload; calls.push(['update', payload]); return builder; },
    delete() { state.operation = 'delete'; calls.push(['delete']); return builder; },
    eq(column, value) { state.filters.push([column, value]); calls.push(['eq', column, value]); return builder; },
    order(column, options) { state.orders.push([column, options]); calls.push(['order', column, options]); return builder; },
    single() { calls.push(['single']); return Promise.resolve(response); },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
  return {
    client: {
      from(table) { calls.push(['from', table]); return builder; },
      rpc(name, args) {
        state.operation = 'rpc';
        state.rpcName = name;
        state.rpcArguments = args;
        calls.push(['rpc', name, args]);
        return builder;
      }
    },
    calls,
    state
  };
}

test('list is tenant scoped, ordered by updated_at desc/id and accepts zero rows', async () => {
  const mock = mockClient({ data: [], error: null });
  assert.deepEqual(await service.listWhatsAppCustomMessages('company-a', mock.client), []);
  assert.deepEqual(mock.state.filters, [['company_id', 'company-a']]);
  assert.deepEqual(mock.state.orders, [
    ['updated_at', { ascending: false }],
    ['id', { ascending: true }]
  ]);
});

test('create builds an explicit normalized payload without event or omitted fields', async () => {
  const mock = mockClient({ data: row, error: null });
  const created = await service.createWhatsAppCustomMessage('company-a', {
    name: '  Boas-vindas  ', content: '  Olá {{cliente.nome}}  ', contextType: 'customer'
  }, mock.client);
  assert.deepEqual(mock.state.payload, {
    company_id: 'company-a',
    name: 'Boas-vindas',
    content: 'Olá {{cliente.nome}}',
    context_type: 'customer'
  });
  assert.equal(created.kind, 'custom');
  assert.equal(created.companyId, 'company-a');
  assert.equal('eventKey' in created, false);
  assert.equal('event_key' in created, false);
  assert.equal('active' in created, false);
});

test('atomic update sends one RPC without client-controlled company id and returns the updated row', async () => {
  const updatedRow = { ...row, name: 'Retorno', updated_at: '2026-08-12T13:00:00.000Z' };
  const mock = mockClient({ data: atomicResult('UPDATED', updatedRow), error: null });
  const updated = await service.updateWhatsAppCustomMessage('company-a', 'message-a', {
    name: 'Retorno', content: 'Olá {{empresa.nome}}', contextType: 'generic', expectedUpdatedAt: row.updated_at
  }, mock.client);
  assert.equal(updated.name, 'Retorno');
  assert.equal(updated.updatedAt, updatedRow.updated_at);
  assert.equal(mock.state.rpcName, 'update_whatsapp_custom_message_atomic');
  assert.deepEqual(mock.state.rpcArguments, {
    p_message_id: 'message-a',
    p_name: 'Retorno',
    p_content: 'Olá {{empresa.nome}}',
    p_context_type: 'generic',
    p_expected_updated_at: row.updated_at
  });
  assert.equal('company_id' in mock.state.rpcArguments, false);
  assert.equal('p_company_id' in mock.state.rpcArguments, false);
  assert.equal(mock.calls.filter(([operation]) => operation === 'rpc').length, 1);
  assert.equal(mock.calls.some(([operation]) => operation === 'from'), false);
});

test('stale optimistic concurrency token maps to CONFLICT instead of NOT_FOUND', async () => {
  const mock = mockClient({ data: atomicResult('CONFLICT'), error: null });
  await assert.rejects(
    service.updateWhatsAppCustomMessage('company-a', 'message-a', {
      name: 'Retorno', content: 'Olá', contextType: 'generic', expectedUpdatedAt: row.updated_at
    }, mock.client),
    (error) => error.code === 'CONFLICT' && /alterada por outro usuário/i.test(error.message)
  );
});

test('atomic update maps a missing row to NOT_FOUND independently', async () => {
  const mock = mockClient({ data: atomicResult('NOT_FOUND', null), error: null });
  await assert.rejects(
    service.updateWhatsAppCustomMessage('company-a', 'message-missing', {
      name: 'Retorno', content: 'Olá', contextType: 'generic', expectedUpdatedAt: row.updated_at
    }, mock.client),
    (error) => error.code === 'NOT_FOUND'
  );
});

test('atomic update preserves granular authorization denial', async () => {
  const mock = mockClient({ data: atomicResult('NOT_AUTHORIZED', null), error: null });
  await assert.rejects(
    service.updateWhatsAppCustomMessage('company-a', 'message-a', {
      name: 'Retorno', content: 'Olá', contextType: 'generic', expectedUpdatedAt: row.updated_at
    }, mock.client),
    (error) => error.code === 'NOT_AUTHORIZED'
  );
});

test('atomic update requires the exact expected updated_at before persistence', async () => {
  let persistenceCalls = 0;
  const client = {
    from() { persistenceCalls += 1; throw new Error('must not query'); },
    rpc() { persistenceCalls += 1; throw new Error('must not query'); }
  };
  await assert.rejects(
    service.updateWhatsAppCustomMessage('company-a', 'message-a', {
      name: 'Retorno', content: 'Olá', contextType: 'generic', expectedUpdatedAt: ''
    }, client),
    (error) => error.code === 'NOT_FOUND'
  );
  assert.equal(persistenceCalls, 0);
});

test('delete targets exact id and tenant and reports missing rows', async () => {
  const found = mockClient({ data: { id: 'message-a' }, error: null });
  assert.equal(await service.deleteWhatsAppCustomMessage('company-a', 'message-a', found.client), 'message-a');
  assert.deepEqual(found.state.filters, [['id', 'message-a'], ['company_id', 'company-a']]);

  const missing = mockClient({ data: null, error: null });
  await assert.rejects(
    service.deleteWhatsAppCustomMessage('company-a', 'message-b', missing.client),
    (error) => error.code === 'NOT_FOUND'
  );
});

test('data layer maps duplicate, authorization and unexpected persistence errors safely', async () => {
  const cases = [
    ['23505', 'DUPLICATE_NAME'],
    ['42501', 'NOT_AUTHORIZED'],
    ['XX000', 'PERSISTENCE_ERROR']
  ];
  for (const [databaseCode, expectedCode] of cases) {
    const mock = mockClient({ data: null, error: { code: databaseCode, message: 'private database detail' } });
    await assert.rejects(
      service.createWhatsAppCustomMessage('company-a', { name: 'Contato', content: 'Olá', contextType: 'generic' }, mock.client),
      (error) => error.code === expectedCode && !error.message.includes('private database detail')
    );
  }
});

test('validation runs before persistence and rejects arbitrary placeholders', async () => {
  let fromCalls = 0;
  const client = { from() { fromCalls += 1; throw new Error('must not query'); } };
  await assert.rejects(
    service.createWhatsAppCustomMessage('company-a', {
      name: 'Contato', content: 'Olá {{orders.total}}', contextType: 'generic'
    }, client),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(fromCalls, 0);
});

test('create rejects a runtime event key before persistence', async () => {
  let fromCalls = 0;
  const client = { from() { fromCalls += 1; throw new Error('must not query'); } };
  await assert.rejects(
    service.createWhatsAppCustomMessage('company-a', {
      name: 'Proposta', content: 'Olá', contextType: 'generic', eventKey: 'quote_proposal'
    }, client),
    (error) => error.code === 'VALIDATION_ERROR' && /eventos do sistema/i.test(error.message)
  );
  assert.equal(fromCalls, 0);
});
