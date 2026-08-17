import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

async function loadPermissionHelper() {
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
  return module.exports.hasSystemMessageContextPermissions;
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
  const allowed = await loadPermissionHelper();
  const permissions = (entries) => new Map(entries);
  const whatsapp = ['/whatsapp', ['admin', 'gerente']];

  assert.equal(allowed('quote_proposal', 'gerente', permissions([whatsapp, ['/quotes', ['admin']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin']], ['/financial', ['admin', 'gerente']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin', 'gerente']], ['/financial', ['admin']]])), false);
  assert.equal(allowed('production_status_changed', 'gerente', permissions([whatsapp, ['/production', ['admin']]])), false);
  assert.equal(allowed('order_payment_pending', 'gerente', permissions([whatsapp, ['/orders', ['admin', 'gerente']], ['/financial', ['admin', 'gerente']]])), true);
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
