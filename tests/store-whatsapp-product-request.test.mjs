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

const engine = await compile('../src/lib/whatsapp/template-engine.ts');
const registry = await compile('../src/lib/whatsapp/template-registry.ts');
const subject = await compile('../src/lib/store/whatsapp-product-request.ts', {
  '@/lib/whatsapp/template-engine': engine,
  '@/lib/whatsapp/template-registry': registry
});
const lockSubject = await compile('../src/lib/store/product-request-lock.ts');
const route = await readFile(new URL('../src/app/api/store/whatsapp/product-request/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/store/page.tsx', import.meta.url), 'utf8');
const modal = await readFile(new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url), 'utf8');

const baseContext = {
  companyName: 'Empresa A',
  publicPhone: '51999999999',
  product: { id: 'p1', name: 'Produto do servidor', active: true, catalog_active: true, sales_price: 10, pricing_type: 'Unidade' },
  productVariables: { produto_nome: 'Produto do servidor', tipo_venda: 'Unidade', 'produto.preco': 'R$ 20,00' },
  template: null,
  settings: null
};

test('valid product uses server product data, default template and public phone fallback', () => {
  const result = subject.resolveStoreProductRequest({ productId: 'p1', quantity: 2, customerName: 'Cliente' }, baseContext);
  assert.equal(result.enabled, true);
  assert.match(result.message, /Produto do servidor/);
  assert.match(result.message, /R\$\s*20,00/);
  assert.match(result.href, /^https:\/\/wa\.me\/5551999999999\?text=/);
});

test('custom tenant template, signature, company-name toggle and business phone are effective', () => {
  const result = subject.resolveStoreProductRequest({ quantity: 1 }, {
    ...baseContext,
    template: { active: true, content: 'Pedido de {{produto_nome}} para {{empresa_nome}}.' },
    settings: { business_phone: '11988887777', country_code: '55', signature: 'Equipe Loja', include_company_name: false, open_mode: 'web', confirm_before_open: false }
  });
  assert.equal(result.enabled, true);
  assert.equal(result.confirmBeforeOpen, false);
  assert.equal(result.openMode, 'web');
  assert.match(result.message, /Pedido de Produto do servidor para \./);
  assert.match(result.message, /Equipe Loja$/);
  assert.match(result.href, /^https:\/\/web\.whatsapp\.com\/send\?phone=5511988887777&text=/);
});

test('inactive template and unavailable products fail closed', () => {
  assert.deepEqual(subject.resolveStoreProductRequest({}, { ...baseContext, template: { active: false, content: 'x' } }), { ok: true, enabled: false, reason: 'MESSAGE_TEMPLATE_DISABLED' });
  for (const product of [null, { ...baseContext.product, active: false }, { ...baseContext.product, catalog_active: false }]) {
    assert.equal(subject.resolveStoreProductRequest({}, { ...baseContext, product }).reason, 'PRODUCT_UNAVAILABLE');
  }
});

test('auto, web and app modes reuse the central URL builder', () => {
  const auto = subject.resolveStoreProductRequest({}, { ...baseContext, settings: { open_mode: 'auto' } });
  const web = subject.resolveStoreProductRequest({}, { ...baseContext, settings: { open_mode: 'web' } });
  const app = subject.resolveStoreProductRequest({}, { ...baseContext, settings: { open_mode: 'app' } });
  assert.match(auto.href, /^https:\/\/wa\.me\//);
  assert.match(web.href, /^https:\/\/web\.whatsapp\.com\//);
  assert.match(app.href, /^https:\/\/wa\.me\//);
});

test('empty signature adds no blank suffix and inputs are bounded', () => {
  const result = subject.resolveStoreProductRequest({ notes: 'x'.repeat(800), selectedOptions: Array.from({ length: 50 }, () => ({ name: 'opção' })) }, { ...baseContext, settings: { signature: '   ' } });
  assert.doesNotMatch(result.message, /\n{3,}$/);
  assert.ok(result.message.length < 4000);
});

test('route derives tenant from hostname, ignores body company id and filters product by resolved company', () => {
  assert.match(route, /resolveStoreLookupHostname/);
  assert.match(route, /\.eq\('id', productId\)\.eq\('company_id', company\.id\)/);
  assert.doesNotMatch(route, /input\.companyId|input\.company_id/);
  assert.match(route, /\.eq\('event_key', 'store_product_request'\)/);
  assert.match(route, /missingSchemaCodes/);
  assert.match(route, /Cache-Control.*no-store/s);
});

test('public response is minimized and client never imports service role', () => {
  assert.doesNotMatch(page, /server-admin|SUPABASE_SERVICE_ROLE|whatsapp_message_templates|whatsapp_settings/);
  assert.doesNotMatch(route, /return json\(\{[^}]*company_id/s);
  assert.doesNotMatch(route, /metadataSanitized[^\n]*return json/);
});

test('Store handler executes least-privilege projections and passes only preloaded tenant sources', async () => {
  const selections = [];
  const filters = [];
  const rows = {
    products: { id: 'p1', company_id: 'company-a', category_id: 'category-a', name: 'Produto do servidor', description: 'Descrição', active: true, catalog_active: true, sales_price: 10, pricing_type: 'unidade', pricing_details: {}, image_url: null, volume_pricing: [] },
    categories: { id: 'category-a', company_id: 'company-a', name: 'Categoria A' },
    settings: { company_id: 'company-a', catalog_whatsapp: '51999999999' },
    whatsapp_message_templates: null,
    whatsapp_settings: { company_id: 'company-a', country_code: '55', business_phone: null, signature: null, open_mode: 'auto', confirm_before_open: false, include_company_name: true }
  };
  const supabase = {
    from(table) {
      return {
        select(columns) {
          selections.push({ table, columns });
          const builder = {
            or() { return builder; },
            eq(column, value) { filters.push({ table, column, value }); return builder; },
            async limit() { return { data: [{ id: 'company-a', name: 'Empresa A' }], error: null }; },
            async maybeSingle() { return { data: rows[table], error: null }; }
          };
          return builder;
        }
      };
    }
  };
  let resolverContext;
  let productResolverContext;
  const routeSubject = await compile('../src/app/api/store/whatsapp/product-request/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => supabase },
    '@/lib/store/normalize-store-host': { isLocalStoreHost: () => false, normalizeStoreHost: (value) => String(value || '').split(':')[0] },
    '@/lib/store/resolve-store-lookup-hostname.mjs': { resolveStoreLookupHostname: (value) => value },
    '@/lib/store/whatsapp-product-request': subject,
    '@/lib/whatsapp/variable-resolver.server': {
      resolveWhatsAppCompanyVariables: async (context) => {
        resolverContext = context;
        return {
          variables: { 'empresa.nome': context.existingCompany.name, 'empresa.whatsapp': context.existingSettings.catalog_whatsapp },
          missing: [],
          metadataSanitized: { eventKey: context.eventKey, effectiveBusinessPhone: '5551999999999', businessPhoneSource: 'catalog_whatsapp', queryCounts: { company: 0, settings: 0, whatsappSettings: 0 } }
        };
      }
    },
    '@/lib/whatsapp/customer-product-variable-resolver.server': {
      createStoreProductPricingContext: () => ({ pricingConfig: { quantity: 1 }, selectedOptionsPresent: false }),
      createSupabaseWhatsAppEntityDataSource: () => ({ marker: 'same-server-client' }),
      isWhatsAppProductUnavailableError: (error) => /PRODUCT_(NOT_FOUND|UNAVAILABLE)/.test(error?.message || ''),
      resolveWhatsAppProductVariables: async (context) => {
        productResolverContext = context;
        return {
          variables: { 'produto.nome': context.existingProduct.name, produto_nome: context.existingProduct.name, 'produto.preco': 'R$ 10,00', tipo_venda: 'unidade' },
          missing: [],
          metadataSanitized: { eventKey: context.eventKey, queryCounts: { product: 0, category: 1 }, priceSource: 'src/lib/pricing.ts' }
        };
      }
    }
  });
  const response = await routeSubject.POST({
    headers: { get: (name) => name === 'host' ? 'store.example.com' : null },
    nextUrl: { hostname: 'store.example.com' },
    json: async () => ({ productId: 'p1', quantity: 1 })
  });

  assert.equal(response.status, 200);
  assert.equal(selections.find((entry) => entry.table === 'companies').columns, 'id,name');
  assert.equal(selections.find((entry) => entry.table === 'settings').columns, 'company_id,catalog_whatsapp');
  assert.equal(selections.find((entry) => entry.table === 'whatsapp_settings').columns, 'company_id,country_code,business_phone,signature,open_mode,confirm_before_open,include_company_name');
  assert.equal(selections.find((entry) => entry.table === 'products').columns, 'id,company_id,category_id,name,description,pricing_type,sales_price,active,catalog_active,pricing_details,image_url,volume_pricing');
  assert.deepEqual(filters.filter((entry) => entry.table === 'products'), [
    { table: 'products', column: 'id', value: 'p1' },
    { table: 'products', column: 'company_id', value: 'company-a' }
  ]);
  assert.deepEqual(Object.keys(resolverContext.existingCompany).sort(), ['id', 'name']);
  assert.deepEqual(Object.keys(resolverContext.existingSettings).sort(), ['catalog_whatsapp', 'company_id']);
  assert.equal(resolverContext.companyId, 'company-a');
  assert.equal(resolverContext.trustedCompanyId, 'company-a');
  assert.equal(resolverContext.eventKey, 'store_product_request');
  assert.equal(productResolverContext.trustedCompanyId, 'company-a');
  assert.equal(productResolverContext.productId, 'p1');
  assert.equal(productResolverContext.requireCatalogAvailability, true);
  assert.equal(productResolverContext.existingProduct, rows.products);
});

async function executeStoreRouteWithProduct({ product, productError = null, resolverError = null }) {
  const rows = {
    products: product,
    settings: { company_id: 'company-a', catalog_whatsapp: '51999999999' },
    whatsapp_message_templates: null,
    whatsapp_settings: null
  };
  const supabase = {
    from(table) {
      return {
        select() {
          const builder = {
            or() { return builder; },
            eq() { return builder; },
            async limit() { return { data: [{ id: 'company-a', name: 'Empresa A' }], error: null }; },
            async maybeSingle() {
              return table === 'products'
                ? { data: rows.products, error: productError }
                : { data: rows[table], error: null };
            }
          };
          return builder;
        }
      };
    }
  };
  const routeSubject = await compile('../src/app/api/store/whatsapp/product-request/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => supabase },
    '@/lib/store/normalize-store-host': { isLocalStoreHost: () => false, normalizeStoreHost: (value) => String(value || '').split(':')[0] },
    '@/lib/store/resolve-store-lookup-hostname.mjs': { resolveStoreLookupHostname: (value) => value },
    '@/lib/store/whatsapp-product-request': subject,
    '@/lib/whatsapp/variable-resolver.server': {
      resolveWhatsAppCompanyVariables: async () => ({
        variables: { 'empresa.nome': 'Empresa A', 'empresa.whatsapp': '51999999999' },
        metadataSanitized: { effectiveBusinessPhone: '5551999999999' }
      })
    },
    '@/lib/whatsapp/customer-product-variable-resolver.server': {
      createStoreProductPricingContext: () => ({ pricingConfig: { quantity: 1 }, selectedOptionsPresent: false }),
      createSupabaseWhatsAppEntityDataSource: () => ({}),
      isWhatsAppProductUnavailableError: (error) => /PRODUCT_(NOT_FOUND|UNAVAILABLE)/.test(error?.message || ''),
      resolveWhatsAppProductVariables: async () => {
        if (resolverError) throw resolverError;
        return { variables: { produto_nome: 'Produto', tipo_venda: 'unidade', 'produto.preco': 'R$ 10,00' } };
      }
    }
  });
  return routeSubject.POST({
    headers: { get: (name) => name === 'host' ? 'store.example.com' : null },
    nextUrl: { hostname: 'store.example.com' },
    json: async () => ({ productId: 'p1', quantity: 1 })
  });
}

test('Store handler converges missing, cross-tenant, inactive and hidden products to the same sanitized 404', async () => {
  const valid = { id: 'p1', company_id: 'company-a', name: 'Produto', active: true, catalog_active: true, pricing_type: 'unidade', sales_price: 10 };
  const unavailableProducts = [
    null,
    { ...valid, company_id: 'company-b' },
    { ...valid, active: false },
    { ...valid, catalog_active: false }
  ];
  for (const product of unavailableProducts) {
    const response = await executeStoreRouteWithProduct({ product });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Produto indisponível.' });
    assert.notEqual(response.status, 503);
  }

  for (const code of ['PRODUCT_NOT_FOUND', 'PRODUCT_UNAVAILABLE']) {
    const response = await executeStoreRouteWithProduct({
      product: valid,
      resolverError: new Error(`WHATSAPP_ENTITY_RESOLUTION_${code}`)
    });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Produto indisponível.' });
  }
});

test('Store handler preserves 503 for an actual product query failure', async () => {
  const response = await executeStoreRouteWithProduct({
    product: null,
    productError: { code: 'PGRST500', message: 'database unavailable' }
  });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'Solicitação indisponível.' });
});

test('store performs one request on explicit click and keeps visual pending protection', () => {
  assert.match(page, /whatsAppProductRequestLocksRef = useRef<Set<string>>/);
  assert.match(page, /withProductRequestLock\(whatsAppProductRequestLocksRef\.current, payload\.product_id/);
  assert.match(page, /fetch\('\/api\/store\/whatsapp\/product-request'/);
  assert.match(modal, /isWhatsAppRequestPending/);
  assert.match(modal, /disabled=.*isWhatsAppRequestPending/);
  assert.match(modal, /isConfigurationIncomplete = !priceResolution\.isComplete/);
  assert.doesNotMatch(page, /buildWhatsAppOrderMessage|openWhatsAppWithMessage/);
});

test('same-tick duplicate requests execute one fetch and one open, then release for a later retry', async () => {
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

test('lock releases after failure and permits a successful retry', async () => {
  const locks = new Set();
  let releaseFailure;
  let attempts = 0;
  const failure = new Promise((_, reject) => { releaseFailure = reject; });
  const first = lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; await failure; });
  const duplicate = lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; });
  assert.deepEqual(await duplicate, { executed: false });
  releaseFailure(new Error('network failure'));
  await assert.rejects(first, /network failure/);
  await lockSubject.withProductRequestLock(locks, 'product-a', async () => { attempts += 1; });
  assert.equal(attempts, 2);
});

test('locks are independent per product and confirmation preparation is not duplicated', async () => {
  const locks = new Set();
  let releaseA;
  let releaseB;
  let modalCount = 0;
  const operation = (promise) => async () => { const result = await promise; if (result.confirmBeforeOpen) modalCount += 1; };
  const promiseA = new Promise((resolve) => { releaseA = resolve; });
  const promiseB = new Promise((resolve) => { releaseB = resolve; });
  const firstA = lockSubject.withProductRequestLock(locks, 'product-a', operation(promiseA));
  const duplicateA = lockSubject.withProductRequestLock(locks, 'product-a', operation(promiseA));
  const firstB = lockSubject.withProductRequestLock(locks, 'product-b', operation(promiseB));
  assert.deepEqual(await duplicateA, { executed: false });
  assert.equal(locks.size, 2);
  releaseA({ confirmBeforeOpen: true });
  releaseB({ confirmBeforeOpen: true });
  await Promise.all([firstA, firstB]);
  assert.equal(modalCount, 2);
  assert.equal(locks.size, 0);
});

test('confirmation is shown only when requested and cancellation never opens WhatsApp', () => {
  assert.match(page, /if \(result\.confirmBeforeOpen\) setPendingWhatsAppOpen/);
  assert.match(page, /else window\.open/);
  assert.match(page, /onClick=\{\(\) => setPendingWhatsAppOpen\(null\)\}/);
  assert.match(page, /Confirmar e abrir/);
});

test('other three administrative events remain wired to the central resolver', async () => {
  for (const [path, event] of [['../src/app/(dashboard)/quotes/page.tsx', 'quote_proposal'], ['../src/app/(dashboard)/orders/page.tsx', 'order_payment_pending'], ['../src/app/(dashboard)/production/page.tsx', 'production_status_changed']]) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`resolveWhatsAppTemplate\\(company\\.id, '${event}'`));
  }
});
