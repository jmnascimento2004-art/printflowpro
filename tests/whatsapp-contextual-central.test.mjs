import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

async function loadPermissionHelpers() {
  const source = (await read('../src/lib/whatsapp/system-message-auth.server.ts')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name === '@/lib/pdf/pdf-server-auth') return { authenticatePdfRequest() { throw new Error('not used'); } };
    if (name === '@/lib/supabase/server-admin') return { getSupabaseAdminClient() { throw new Error('not used'); } };
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

async function loadOperationalRouteHarness() {
  const state = {
    access: { companyId: 'tenant-a', role: 'vendas' },
    authError: null,
    permissionError: null,
    permissions: [],
    permissionQueries: [],
    resolverCalls: [],
    resolve: async (input) => {
      const message = 'Olá, Cliente!\nPedido pronto para você.';
      return {
        eventKey: input.context.eventKey,
        active: true,
        confirmBeforeOpen: false,
        testHref: `https://wa.me/5511999999999?text=${encodeURIComponent(message)}`,
        recipient: '5511999999999',
        variables: { saldo_pendente: 'R$ 60,00' },
        renderedContent: message
      };
    }
  };

  const authSource = (await read('../src/lib/whatsapp/system-message-auth.server.ts')).replace("import 'server-only';", '');
  const authCode = ts.transpileModule(authSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const authModule = { exports: {} };
  new Function('require', 'exports', 'module', authCode)((name) => {
    if (name === '@/lib/pdf/pdf-server-auth') {
      return {
        async authenticatePdfRequest() {
          if (state.authError) throw state.authError;
          return state.access;
        }
      };
    }
    if (name === '@/lib/supabase/server-admin') {
      return {
        getSupabaseAdminClient() {
          return {
            from(table) {
              assert.equal(table, 'role_permissions');
              const query = { companyId: '', paths: [] };
              const builder = {
                select(projection) {
                  assert.equal(projection, 'path,roles');
                  return builder;
                },
                eq(column, value) {
                  assert.equal(column, 'company_id');
                  query.companyId = value;
                  return builder;
                },
                in(column, paths) {
                  assert.equal(column, 'path');
                  query.paths = [...paths];
                  state.permissionQueries.push(query);
                  return Promise.resolve({
                    data: state.permissions.filter((row) => paths.includes(row.path)),
                    error: state.permissionError
                  });
                }
              };
              return builder;
            }
          };
        }
      };
    }
    throw new Error(`Unexpected auth import: ${name}`);
  }, authModule.exports, authModule);

  const routeSource = await read('../src/app/api/whatsapp/system-message/runtime/route.ts');
  const routeCode = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const routeModule = { exports: {} };
  new Function('require', 'exports', 'module', routeCode)((name) => {
    if (name === 'next/server') {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    if (name === '@/lib/whatsapp/system-message-auth.server') return authModule.exports;
    if (name === '@/lib/whatsapp/system-message-resolver.server') {
      return {
        async resolveSystemWhatsAppMessage(input) {
          state.resolverCalls.push(input);
          return state.resolve(input);
        }
      };
    }
    throw new Error(`Unexpected route import: ${name}`);
  }, routeModule.exports, routeModule);

  return { POST: routeModule.exports.POST, state };
}

function operationalRequest(body, { malformed = false } = {}) {
  return new Request('http://localhost/api/whatsapp/system-message/runtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token' },
    body: malformed ? '{' : JSON.stringify(body)
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function compileContextResolutionEffect(pageSource, { removeStaleSuccessGuard = false } = {}) {
  const normalized = pageSource.replace(/\r\n/g, '\n');
  const startMarker = `  useEffect(() => {
    const sequence = ++contextRequestSequenceRef.current;`;
  const endMarker = `  }, [content, contextualEvent, selectedContextId, selectedEventKey, session?.access_token, systemValidation.valid, tab]);`;
  const start = normalized.indexOf(startMarker);
  const end = normalized.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'context resolution effect start must remain discoverable');
  assert.notEqual(end, -1, 'context resolution effect end must remain discoverable');

  let body = normalized.slice(start + `  useEffect(() => {\n`.length, end);
  const staleSuccessGuard = 'if (sequence !== contextRequestSequenceRef.current || controller.signal.aborted) return;';
  assert.match(body, new RegExp(staleSuccessGuard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (removeStaleSuccessGuard) body = body.replace(staleSuccessGuard, '');

  const source = `
    export function runContextResolutionEffect(env: any) {
      const {
        contextRequestSequenceRef,
        contextAbortRef,
        tab,
        contextualEvent,
        selectedContextId,
        setContextResolution,
        selectedEventKey,
        content,
        systemValidation,
        session,
        window,
        fetch
      } = env;
      ${body}
    }
  `;
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', code)(module.exports, module);
  return module.exports.runContextResolutionEffect;
}

function contextualResponse(contextId) {
  const label = contextId === 'context-a'
    ? 'PED-A / Cliente A / valor A'
    : 'PED-B / Cliente B / valor B';
  return {
    ok: true,
    async json() {
      return {
        eventKey: 'order_payment_pending',
        renderedContent: label,
        recipientAvailable: true,
        testHref: `https://wa.me/5500000000000?text=${encodeURIComponent(label)}`,
        missing: [],
        contextSummary: label,
        variablesState: 'complete'
      };
    }
  };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

async function executeReverseResponseScenario(runEffect) {
  const requestA = deferred();
  const requestB = deferred();
  const started = [];
  const history = [];
  const contextRequestSequenceRef = { current: 0 };
  const contextAbortRef = { current: null };
  let state = { status: 'idle', requestKey: '' };
  const setContextResolution = (next) => {
    state = typeof next === 'function' ? next(state) : next;
    history.push(state);
  };
  const fetch = (_url, init) => {
    const { contextId } = JSON.parse(init.body);
    started.push({ contextId, signal: init.signal });
    return contextId === 'context-a' ? requestA.promise : requestB.promise;
  };
  const testWindow = {
    setTimeout(callback) {
      return setTimeout(callback, 0);
    },
    clearTimeout(timer) {
      clearTimeout(timer);
    }
  };
  const common = {
    contextRequestSequenceRef,
    contextAbortRef,
    tab: 'templates',
    contextualEvent: true,
    setContextResolution,
    selectedEventKey: 'order_payment_pending',
    content: 'Pedido {{pedido_codigo}} para {{cliente_nome}}',
    systemValidation: { valid: true },
    session: { access_token: 'synthetic-test-token' },
    window: testWindow,
    fetch
  };

  const cleanupA = runEffect({ ...common, selectedContextId: 'context-a' });
  await waitFor(() => started.some((request) => request.contextId === 'context-a'), 'request A must start');
  cleanupA();

  const cleanupB = runEffect({ ...common, selectedContextId: 'context-b' });
  await waitFor(() => started.some((request) => request.contextId === 'context-b'), 'request B must start');
  assert.equal(started[0].signal.aborted, true, 'request A is aborted, but its deferred mock deliberately remains resolvable');

  requestB.resolve(contextualResponse('context-b'));
  await waitFor(() => state.status === 'resolved', 'B must resolve into visible state');
  const afterB = state.data.renderedContent;

  requestA.resolve(contextualResponse('context-a'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const afterLateA = state.data.renderedContent;
  cleanupB();

  return { started, history, afterB, afterLateA };
}

test('context route accepts only event, context id and optional draft while deriving tenant authority server-side', async () => {
  const [route, auth] = await Promise.all([
    read('../src/app/api/whatsapp/system-message/resolve/route.ts'),
    read('../src/lib/whatsapp/system-message-auth.server.ts')
  ]);

  assert.match(route, /\['eventKey', 'contextId', 'draftContent'\]/);
  assert.match(route, /keys\.some\(\(key\) => !\['eventKey', 'contextId', 'draftContent'\]\.includes\(key\)\)/);
  assert.doesNotMatch(route.match(/type ContextualEventKey[\s\S]+?(?=function friendlyResolutionError)/)?.[0] || '', /companyId|customerId|recipient|pix|saldo/i);
  assert.match(route, /authorizeSystemMessageContext\(request, body\.eventKey\)/);
  assert.match(route, /trustedCompanyId,/);
  assert.match(route, /allowMissingRecipient: true/);
  assert.doesNotMatch(route.match(/return noStoreJson\(\{[\s\S]+?variablesState:[\s\S]+?\}\);/)?.[0] || '', /recipient:|variables:/);
  assert.match(route, /Cache-Control': 'private, no-store, max-age=0'/);

  assert.match(auth, /^import 'server-only';/);
  assert.match(auth, /authenticatePdfRequest\(request\)/);
  assert.match(auth, /\.eq\('company_id', access\.companyId\)/);
  assert.match(auth, /quote_proposal: \['\/whatsapp', '\/quotes'\]/);
  assert.match(auth, /order_payment_pending: \['\/whatsapp', '\/orders', '\/financial'\]/);
  assert.match(auth, /production_status_changed: \['\/whatsapp', '\/production'\]/);
});

test('the route binds every event to exactly one explicit contextual identifier and excludes Store demo', async () => {
  const route = await read('../src/app/api/whatsapp/system-message/resolve/route.ts');
  assert.match(route, /quoteId: contextId/);
  assert.match(route, /orderId: contextId/);
  assert.match(route, /productionItemId: contextId/);
  assert.doesNotMatch(route.match(/const CONTEXTUAL_EVENTS[\s\S]+?\]\);/)?.[0] || '', /store_product_request/);
  assert.doesNotMatch(route, /first\(|last\(|limit\(1\)|customer\.name\s*===/);
});

test('source-module permissions fail closed for each contextual event', async () => {
  const { hasSystemMessageContextPermissions: allowed } = await loadPermissionHelpers();
  const permissions = (entries) => new Map(entries);
  const whatsapp = ['/whatsapp', ['admin', 'gerente']];

  assert.equal(allowed('quote_proposal', 'gerente', permissions([whatsapp, ['/quotes', ['admin']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin']], ['/financial', ['admin', 'gerente']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin', 'gerente']], ['/financial', ['admin']]])), false);
  assert.equal(allowed('production_status_changed', 'gerente', permissions([whatsapp, ['/production', ['admin']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin', 'gerente']], ['/financial', ['admin', 'gerente']]])), true);
});

test('operational permissions exclude WhatsApp administration and preserve financial containment', async () => {
  const { hasOperationalSystemMessageContextPermissions: allowed } = await loadPermissionHelpers();
  const permissions = (entries) => new Map(entries);

  assert.equal(allowed('quote_proposal', 'vendas', permissions([['/quotes', ['vendas']], ['/whatsapp', []]])), true);
  assert.equal(allowed('production_status_changed', 'producao', permissions([['/production', ['producao']], ['/whatsapp', []]])), true);
  assert.equal(allowed('order_payment_pending', 'financeiro', permissions([['/orders', ['financeiro']], ['/financial', ['financeiro']], ['/whatsapp', []]])), true);
  assert.equal(allowed('order_payment_pending', 'vendas', permissions([['/orders', ['vendas']], ['/financial', []], ['/whatsapp', ['vendas']]])), false);
  assert.equal(allowed('order_payment_pending', 'financeiro', permissions([['/orders', []], ['/financial', ['financeiro']]])), false);
});

test('operational runtime route accepts only event and context id and never accepts authority fields', async () => {
  const [route, auth] = await Promise.all([
    read('../src/app/api/whatsapp/system-message/runtime/route.ts'),
    read('../src/lib/whatsapp/system-message-auth.server.ts')
  ]);
  assert.match(route, /\['eventKey', 'contextId'\]/);
  assert.match(route, /authorizeOperationalSystemMessageContext\(request, body\.eventKey\)/);
  assert.match(route, /resolveSystemWhatsAppMessage/);
  assert.doesNotMatch(route.match(/function parseRequestBody[\s\S]+?(?=function buildContext)/)?.[0] || '', /companyId|customerId|recipient|variables|pix|saldo/i);
  assert.doesNotMatch(route.match(/return noStoreJson\(\{[\s\S]+?href:[\s\S]+?\}\);/)?.[0] || '', /recipient:|variables:|renderedContent:/);
  assert.match(auth, /quote_proposal: \['\/quotes'\]/);
  assert.match(auth, /order_payment_pending: \['\/orders', '\/financial'\]/);
  assert.match(auth, /production_status_changed: \['\/production'\]/);
});

test('operational Route Handler resolves quote, order and production with minimized encoded responses', async () => {
  const { POST, state } = await loadOperationalRouteHarness();
  const cases = [
    {
      eventKey: 'quote_proposal', contextId: 'quote-a', role: 'vendas',
      permissions: [{ path: '/quotes', roles: ['vendas'] }],
      requiredPaths: ['/quotes'], expectedContext: { eventKey: 'quote_proposal', quoteId: 'quote-a' }
    },
    {
      eventKey: 'order_payment_pending', contextId: 'order-a', role: 'financeiro',
      permissions: [{ path: '/orders', roles: ['financeiro'] }, { path: '/financial', roles: ['financeiro'] }],
      requiredPaths: ['/orders', '/financial'], expectedContext: { eventKey: 'order_payment_pending', orderId: 'order-a' }
    },
    {
      eventKey: 'production_status_changed', contextId: 'production-a', role: 'producao',
      permissions: [{ path: '/production', roles: ['producao'] }],
      requiredPaths: ['/production'], expectedContext: { eventKey: 'production_status_changed', productionItemId: 'production-a' }
    }
  ];

  for (const scenario of cases) {
    state.access = { companyId: 'tenant-a', role: scenario.role };
    state.permissions = scenario.permissions;
    state.permissionQueries.length = 0;
    state.resolverCalls.length = 0;
    const response = await POST(operationalRequest({ eventKey: scenario.eventKey, contextId: scenario.contextId }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['active', 'confirmBeforeOpen', 'eventKey', 'href']);
    assert.deepEqual(state.resolverCalls, [{ trustedCompanyId: 'tenant-a', context: scenario.expectedContext }]);
    assert.deepEqual(state.permissionQueries, [{ companyId: 'tenant-a', paths: scenario.requiredPaths }]);
    assert.equal(state.permissionQueries[0].paths.includes('/whatsapp'), false);
    assert.equal(new URL(body.href).pathname, '/5511999999999');
    assert.equal(new URL(body.href).searchParams.get('text'), 'Olá, Cliente!\nPedido pronto para você.');
    assert.doesNotMatch(JSON.stringify(body), /recipient|variables|saldo_pendente|renderedContent/);
  }
});

test('operational Route Handler enforces authentication and both financial permissions without WhatsApp permission', async () => {
  const { POST, state } = await loadOperationalRouteHarness();
  for (const reason of ['missing', 'invalid']) {
    state.authError = Object.assign(new Error(reason), { status: 401 });
    const response = await POST(operationalRequest({ eventKey: 'quote_proposal', contextId: 'quote-a' }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Não autenticado.' });
  }

  state.authError = null;
  state.access = { companyId: 'tenant-a', role: 'financeiro' };
  for (const permissions of [
    [{ path: '/orders', roles: ['financeiro'] }, { path: '/financial', roles: [] }],
    [{ path: '/orders', roles: [] }, { path: '/financial', roles: ['financeiro'] }]
  ]) {
    state.permissions = permissions;
    const response = await POST(operationalRequest({ eventKey: 'order_payment_pending', contextId: 'order-a' }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Acesso negado.' });
  }

  state.permissions = [
    { path: '/orders', roles: ['financeiro'] },
    { path: '/financial', roles: ['financeiro'] },
    { path: '/whatsapp', roles: [] }
  ];
  state.permissionQueries.length = 0;
  const allowed = await POST(operationalRequest({ eventKey: 'order_payment_pending', contextId: 'order-a' }));
  assert.equal(allowed.status, 200);
  assert.deepEqual(state.permissionQueries.at(-1).paths, ['/orders', '/financial']);
});

test('operational Route Handler rejects malformed authority payloads and maps missing or foreign entities safely', async () => {
  const { POST, state } = await loadOperationalRouteHarness();
  const invalidRequests = [
    operationalRequest({}, { malformed: true }),
    operationalRequest({ eventKey: 'unknown', contextId: 'quote-a' }),
    operationalRequest({ eventKey: 'quote_proposal' }),
    operationalRequest({ eventKey: 'quote_proposal', quoteId: 'quote-a' }),
    operationalRequest({ eventKey: 'quote_proposal', contextId: 'quote-a', companyId: 'tenant-b' }),
    operationalRequest({ eventKey: 'order_payment_pending', contextId: '', recipient: '5511999999999' })
  ];
  for (const request of invalidRequests) {
    const response = await POST(request);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  }
  assert.equal(state.resolverCalls.length, 0);

  state.access = { companyId: 'tenant-a', role: 'admin' };
  state.permissions = [
    { path: '/quotes', roles: ['admin'] },
    { path: '/orders', roles: ['admin'] },
    { path: '/financial', roles: ['admin'] },
    { path: '/production', roles: ['admin'] }
  ];
  state.resolve = async ({ context }) => {
    if ('quoteId' in context) throw new Error('WHATSAPP_CONTEXT_QUOTE_NOT_FOUND');
    if ('orderId' in context) throw new Error('WHATSAPP_CONTEXT_ORDER_NOT_FOUND');
    if (context.productionItemId === 'foreign-production') throw new Error('WHATSAPP_CONTEXT_TENANT_MISMATCH');
    throw new Error('WHATSAPP_CONTEXT_PRODUCTION_ITEM_NOT_FOUND');
  };

  const missingCases = [
    [{ eventKey: 'quote_proposal', contextId: 'missing-quote' }, 'quoteId'],
    [{ eventKey: 'quote_proposal', contextId: 'order-a' }, 'quoteId'],
    [{ eventKey: 'order_payment_pending', contextId: 'missing-order' }, 'orderId'],
    [{ eventKey: 'production_status_changed', contextId: 'missing-production' }, 'productionItemId'],
    [{ eventKey: 'production_status_changed', contextId: 'foreign-production' }, 'productionItemId']
  ];
  for (const [body, expectedIdentifier] of missingCases) {
    const response = await POST(operationalRequest(body));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: body.contextId === 'foreign-production'
        ? 'O contexto selecionado não está disponível para esta empresa.'
        : 'O contexto selecionado não está mais disponível.'
    });
    const call = state.resolverCalls.at(-1);
    assert.equal(call.trustedCompanyId, 'tenant-a');
    assert.equal(call.context[expectedIdentifier], body.contextId);
    assert.equal('companyId' in call.context, false);
  }
});

test('Central selectors use already loaded arrays only for UX and never send client authority fields', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /const \{ company, customers, quotes, orders, production, rolePermissions \} = useDatabase\(\)/);
  assert.match(page, /quotes\.map/);
  assert.match(page, /orders\.map/);
  assert.match(page, /production\.map/);
  assert.match(page, /matches\.slice\(0, 50\)/);
  assert.match(page, /body: JSON\.stringify\(\{ eventKey: selectedEventKey, contextId: selectedContextId, draftContent: content \}\)/);
  assert.doesNotMatch(page.match(/body: JSON\.stringify\([\s\S]+?\),/)?.[0] || '', /company|customer|recipient|pix|saldo/i);
  assert.doesNotMatch(page, /from\(['"](?:quotes|orders|production_queue)['"]\)/);
});

test('context is always explicit, event changes clear it and UX labels never render raw identifiers', async () => {
  const [page, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx')
  ]);
  assert.match(workspace, /<option value="">Selecione explicitamente<\/option>/);
  assert.match(page, /setSelectedContextId\(''\)/);
  assert.match(page, /setContextSearch\(''\)/);
  assert.match(page, /Nenhum registro é selecionado automaticamente/);
  assert.doesNotMatch(workspace, />\{option\.id\}<\/option>/);
  assert.doesNotMatch(page, /quotes\[0\]|orders\[0\]|production\[0\]/);
});

test('late context A cannot replace context B even when A ignores abort and resolves last', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  const runEffect = compileContextResolutionEffect(page);
  const result = await executeReverseResponseScenario(runEffect);

  assert.deepEqual(result.started.map((request) => request.contextId), ['context-a', 'context-b']);
  assert.equal(result.afterB, 'PED-B / Cliente B / valor B');
  assert.equal(result.afterLateA, 'PED-B / Cliente B / valor B');
  assert.doesNotMatch(result.afterLateA, /PED-A|Cliente A|valor A/);
  assert.match(page, /<MessagePreview[\s\S]+?preview=\{systemPreview\}/);

  const runWithoutStaleGuard = compileContextResolutionEffect(page, { removeStaleSuccessGuard: true });
  const negativeControl = await executeReverseResponseScenario(runWithoutStaleGuard);
  assert.equal(negativeControl.afterB, 'PED-B / Cliente B / valor B');
  assert.equal(negativeControl.afterLateA, 'PED-A / Cliente A / valor A');
});

test('Preview and Test consume one resolved server response and demo modes cannot be tested', async () => {
  const [page, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx')
  ]);
  assert.match(page, /resolvedSystemContext\?\.renderedContent/);
  assert.match(page, /resolvedSystemContext\?\.testHref/);
  assert.match(page, /systemCanTest/);
  assert.match(page, /storeSampleOnly/);
  assert.match(page, /testDisabled=\{!systemCanTest\}/);
  assert.match(page, /showPhone=\{tab === 'custom'\}/);
  assert.match(workspace, /disabled=\{testDisabled\}/);
  assert.match(workspace, /Dados reais/);
  assert.match(workspace, /Amostra/);
});

test('real context failures never fall back to demo text and context selection does not dirty the draft', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /selectedContextId[\s\S]{0,100}currentContextResolution\.status === 'error'[\s\S]{0,100}currentContextResolution\.message/);
  assert.match(page, /onSelect=\{setSelectedContextId\}/);
  assert.doesNotMatch(page, /onSelect=\{\(id\) => \{ setSelectedContextId\(id\); setDirty\(true\)/);
  assert.match(page, /setContent\(value\); setDirty\(true\)/);
});

test('Store stays sample-only in Central and no operational runtime files were repurposed', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /selectedEventKey === 'store_product_request'/);
  assert.match(page, /O teste desta mensagem é feito somente no fluxo real da Loja/);
  assert.doesNotMatch(page, /api\/store\/whatsapp\/product-request/);
});
