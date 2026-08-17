import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const subject = await compile('../src/lib/store/whatsapp-product-request.ts');
const lockSubject = await compile('../src/lib/store/product-request-lock.ts');
const route = await readFile(new URL('../src/app/api/store/whatsapp/product-request/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/store/page.tsx', import.meta.url), 'utf8');
const modal = await readFile(new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url), 'utf8');

const validRequest = {
  productId: 'product-a',
  quantity: 2,
  dimensions: { width: 20, height: 30 },
  selectedOptions: [{ name: 'Fosco', group_id: 'finish', group_name: 'Acabamento' }],
  configurationSnapshot: { material: 'Couchê', size: 'A4', colors: '4x0', finishing: 'Fosco' },
  productionDays: 3,
  estimatedDeadline: '3 dias',
  customerName: 'Cliente',
  customerPhone: '51999999999',
  notes: 'Com acentuação & símbolos'
};

test('public request parser accepts only bounded transient configurator facts', () => {
  assert.deepEqual(subject.parseStoreProductRequestInput(validRequest), validRequest);
  for (const invalid of [
    null,
    {},
    { ...validRequest, quantity: 0 },
    { ...validRequest, dimensions: { width: -1 } },
    { ...validRequest, selectedOptions: [{ name: 'Fosco', price_delta: 999 }] },
    { ...validRequest, configurationSnapshot: { material: 'Couchê', unit_price: 0.01 } },
    { ...validRequest, notes: 'x'.repeat(501) }
  ]) assert.equal(subject.parseStoreProductRequestInput(invalid), null);
});

test('client authority fields and unknown fields are rejected instead of ignored', () => {
  for (const field of ['companyId', 'company_id', 'recipient', 'phone', 'whatsappNumber', 'destinationNumber', 'variables', 'template', 'eventKey', 'secret']) {
    assert.equal(subject.parseStoreProductRequestInput({ ...validRequest, [field]: 'attacker-value' }), null, field);
  }
});

test('Store variable adapter derives bounded facts around canonical product variables', () => {
  const variables = subject.resolveStoreProductRequestVariables({
    quantity: 2,
    dimensions: { width: 20, height: 30 },
    selectedOptions: [{ group_name: 'Acabamento', name: 'Fosco' }],
    customerName: 'Cliente',
    variables: { produto_nome: 'Produto adulterado' }
  }, {
    companyName: 'Empresa A',
    product: { id: 'product-a', name: 'Produto persistido', active: true, catalog_active: true, sales_price: 10, pricing_type: 'unidade' },
    productVariables: { produto_nome: 'Produto canônico', 'produto.preco': 'R$ 20,00' }
  });
  assert.equal(variables.produto_nome, 'Produto canônico');
  assert.equal(variables.quantidade, 2);
  assert.equal(variables.medidas, '20cm x 30cm');
  assert.equal(variables.opcoes, 'Acabamento: Fosco');
  assert.equal(variables.valor_total, 'R$ 20,00');
});

async function executeRoute({
  body = validRequest,
  hostname = 'store.example.com',
  companies = [{ id: 'company-a' }],
  companyError = null,
  resolverResult = {
    eventKey: 'store_product_request',
    active: true,
    confirmBeforeOpen: true,
    recipientAvailable: true,
    testHref: 'https://wa.me/5551999999999?text=Ol%C3%A1%20%26%20bem-vindo%0ALinha%202'
  },
  resolverError = null
} = {}) {
  const observed = { resolverCalls: 0, resolverInput: null, companySelect: null, companyFilter: null };
  const supabase = {
    from(table) {
      assert.equal(table, 'companies');
      return {
        select(columns) {
          observed.companySelect = columns;
          return {
            or(filter) {
              observed.companyFilter = filter;
              return { async limit(value) { assert.equal(value, 2); return { data: companies, error: companyError }; } };
            }
          };
        }
      };
    }
  };
  const routeSubject = await compile('../src/app/api/store/whatsapp/product-request/route.ts', {
    'next/server': { NextResponse: { json: (responseBody, options) => ({ body: responseBody, ...options }) } },
    '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => supabase },
    '@/lib/store/normalize-store-host': {
      isLocalStoreHost: () => false,
      normalizeStoreHost: (value) => String(value || '').split(':')[0].toLowerCase()
    },
    '@/lib/store/resolve-store-lookup-hostname.mjs': { resolveStoreLookupHostname: (value) => value },
    '@/lib/store/whatsapp-product-request': subject,
    '@/lib/whatsapp/system-message-resolver.server': {
      resolveSystemWhatsAppMessage: async (input) => {
        observed.resolverCalls += 1;
        observed.resolverInput = input;
        if (resolverError) throw resolverError;
        return resolverResult;
      }
    }
  });
  const response = await routeSubject.POST({
    headers: { get: (name) => name === 'host' ? hostname : null },
    nextUrl: { hostname },
    json: async () => body
  });
  return { response, observed };
}

test('sixth official event resolves once through the canonical server resolver and hostname tenant', async () => {
  const { response, observed } = await executeRoute();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    eventKey: 'store_product_request',
    active: true,
    confirmBeforeOpen: true,
    href: 'https://wa.me/5551999999999?text=Ol%C3%A1%20%26%20bem-vindo%0ALinha%202'
  });
  assert.deepEqual(Object.keys(response.body).sort(), ['active', 'confirmBeforeOpen', 'eventKey', 'href']);
  assert.equal(observed.resolverCalls, 1);
  assert.equal(observed.companySelect, 'id');
  assert.equal(observed.companyFilter, 'store_domain.eq.store.example.com,custom_domain.eq.store.example.com,admin_domain.eq.store.example.com');
  assert.deepEqual(observed.resolverInput, {
    trustedCompanyId: 'company-a',
    context: {
      eventKey: 'store_product_request',
      productId: 'product-a',
      request: Object.fromEntries(Object.entries(validRequest).filter(([key]) => key !== 'productId'))
    },
    allowMissingRecipient: true
  });
  assert.equal(new URL(response.body.href).searchParams.get('text'), 'Olá & bem-vindo\nLinha 2');
});

test('tenant ambiguity and cross-tenant product contexts fail closed without disclosure', async () => {
  for (const companies of [[], [{ id: 'company-a' }, { id: 'company-b' }]]) {
    const { response, observed } = await executeRoute({ companies });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Loja indisponível.' });
    assert.equal(observed.resolverCalls, 0);
  }
  for (const code of ['PRODUCT_NOT_FOUND', 'PRODUCT_UNAVAILABLE', 'TENANT_MISMATCH']) {
    const { response } = await executeRoute({ resolverError: new Error(`WHATSAPP_ENTITY_RESOLUTION_${code}`) });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Produto indisponível.' });
  }
});

test('invalid and excessive public payloads stop before resolver access', async () => {
  for (const body of [
    { ...validRequest, companyId: 'company-b' },
    { ...validRequest, recipient: '5511000000000' },
    { ...validRequest, variables: { 'empresa.nome': 'Ataque' } },
    { ...validRequest, notes: 'x'.repeat(33000) }
  ]) {
    const { response, observed } = await executeRoute({ body });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: 'Solicitação inválida.' });
    assert.equal(observed.resolverCalls, 0);
  }
});

test('inactive event is returned as inactive while missing recipient is sanitized', async () => {
  const inactive = await executeRoute({ resolverResult: {
    eventKey: 'store_product_request', active: false, confirmBeforeOpen: true,
    recipientAvailable: false, testHref: ''
  } });
  assert.equal(inactive.response.status, 200);
  assert.deepEqual(inactive.response.body, {
    eventKey: 'store_product_request', active: false, confirmBeforeOpen: true, href: ''
  });

  const missing = await executeRoute({ resolverResult: {
    eventKey: 'store_product_request', active: true, confirmBeforeOpen: true,
    recipientAvailable: false, testHref: ''
  } });
  assert.equal(missing.response.status, 422);
  assert.deepEqual(missing.response.body, { error: 'WhatsApp da empresa não configurado.' });
});

test('tenant lookup infrastructure failure is a sanitized service failure', async () => {
  const { response, observed } = await executeRoute({ companyError: { code: 'PGRST500' } });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'Loja indisponível.' });
  assert.equal(observed.resolverCalls, 0);
});

test('unexpected resolver failures never expose internal details', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { response } = await executeRoute({ resolverError: new Error('database secret detail') });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: 'Não foi possível preparar a mensagem agora.' });
    assert.doesNotMatch(JSON.stringify(response.body), /database|secret/i);
  } finally {
    console.error = originalError;
  }
});

test('public route is server-only by dependency, no-store, strict and response-minimized', () => {
  assert.match(route, /resolveStoreLookupHostname/);
  assert.match(route, /resolveSystemWhatsAppMessage/);
  assert.match(route, /trustedCompanyId/);
  assert.match(route, /Cache-Control.*no-store/s);
  assert.doesNotMatch(route, /authenticatePdfRequest|requirePermission|\/whatsapp['"]/);
  assert.doesNotMatch(route, /resolveWhatsAppCompanyVariables|resolveWhatsAppProductVariables|renderConfiguredWhatsAppTemplate|buildWhatsAppUrl/);
  assert.doesNotMatch(route, /recipient: result|variables: result|companyId: result|renderedContent: result/);
});

test('Store client sends facts, not authority, and reconstructs confirmation text from canonical href', () => {
  assert.match(page, /fetch\('\/api\/store\/whatsapp\/product-request'/);
  assert.match(page, /getWhatsAppMessageFromHref\(result\.href\)/);
  assert.match(page, /\['wa\.me', 'web\.whatsapp\.com'\]/);
  assert.doesNotMatch(page, /server-admin|SUPABASE_SERVICE_ROLE|whatsapp_message_templates|whatsapp_settings/);
  const requestBody = page.match(/body: JSON\.stringify\(\{[\s\S]+?\n\s*\}\)\n\s*\}\);/)?.[0] || '';
  assert.ok(requestBody);
  assert.doesNotMatch(requestBody, /companyId|recipient|variables|unit_price|total_price|price_delta|template/);
});

test('store performs one request on explicit click and keeps visual pending protection', () => {
  assert.match(page, /whatsAppProductRequestLocksRef = useRef<Set<string>>/);
  assert.match(page, /withProductRequestLock\(whatsAppProductRequestLocksRef\.current, payload\.product_id/);
  assert.match(modal, /isWhatsAppRequestPending/);
  assert.match(modal, /disabled=.*isWhatsAppRequestPending/);
  assert.match(modal, /isConfigurationIncomplete = !priceResolution\.isComplete/);
  assert.doesNotMatch(page, /buildWhatsAppOrderMessage|openWhatsAppWithMessage/);
});

test('same-tick duplicate requests execute one fetch and one open, then release for retry', async () => {
  const locks = new Set();
  let releaseFetch;
  let fetchCount = 0;
  let openCount = 0;
  const controlledFetch = new Promise((resolve) => { releaseFetch = resolve; });
  const operation = async () => {
    fetchCount += 1;
    const result = await controlledFetch;
    if (result.confirmBeforeOpen === false) openCount += 1;
  };
  const first = lockSubject.withProductRequestLock(locks, 'product-a', operation);
  const duplicate = lockSubject.withProductRequestLock(locks, 'product-a', operation);
  assert.equal(fetchCount, 1);
  assert.deepEqual(await duplicate, { executed: false });
  releaseFetch({ confirmBeforeOpen: false });
  await first;
  assert.equal(openCount, 1);
  await lockSubject.withProductRequestLock(locks, 'product-a', async () => { fetchCount += 1; openCount += 1; });
  assert.equal(fetchCount, 2);
  assert.equal(openCount, 2);
});

test('lock releases after failure and remains independent per product', async () => {
  const locks = new Set();
  let releaseFailure;
  let attempts = 0;
  const failure = new Promise((_, reject) => { releaseFailure = reject; });
  const first = lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; await failure; });
  const duplicate = lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; });
  const other = lockSubject.withProductRequestLock(locks, 'product-b', async () => { attempts += 1; });
  assert.deepEqual(await duplicate, { executed: false });
  await other;
  releaseFailure(new Error('network failure'));
  await assert.rejects(first, /network failure/);
  await lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; });
  assert.equal(attempts, 3);
});

test('confirmation is shown only when requested and cancellation never opens WhatsApp', () => {
  assert.match(page, /if \(result\.confirmBeforeOpen\) setPendingWhatsAppOpen/);
  assert.match(page, /else window\.open/);
  assert.match(page, /onClick=\{\(\) => setPendingWhatsAppOpen\(null\)\}/);
  assert.match(page, /Confirmar e abrir/);
});

test('all five administrative triggers keep the operational authenticated boundary', async () => {
  const consumers = [
    ['../src/app/(dashboard)/quotes/page.tsx', 'quote_proposal', 'sendQuoteProposalWhatsApp', 2],
    ['../src/app/(dashboard)/orders/page.tsx', 'order_payment_pending', 'sendPixWhatsApp', 2],
    ['../src/app/(dashboard)/production/page.tsx', 'production_status_changed', 'sendWhatsAppStatus', 1]
  ];
  let count = 0;
  for (const [path, event, handler, expectedUsages] of consumers) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`resolveOperationalWhatsAppMessage\\([\\s\\S]{0,100}'${event}'`));
    const usages = source.match(new RegExp(`${handler}\\(`, 'g'))?.length || 0;
    assert.equal(usages, expectedUsages);
    count += expectedUsages;
    assert.doesNotMatch(source, /resolveWhatsAppTemplate/);
  }
  assert.equal(count, 5);
});
