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
const route = await readFile(new URL('../src/app/api/store/whatsapp/product-request/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/store/page.tsx', import.meta.url), 'utf8');
const modal = await readFile(new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url), 'utf8');

const baseContext = {
  companyName: 'Empresa A',
  publicPhone: '51999999999',
  product: { id: 'p1', name: 'Produto do servidor', active: true, catalog_active: true, sales_price: 10, pricing_type: 'Unidade' },
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
  assert.match(route, /select\('country_code,business_phone,signature,open_mode,confirm_before_open,include_company_name'\)/);
});

test('store performs one request on explicit click and applies pending duplicate protection', () => {
  assert.match(page, /if \(whatsAppRequestPending\) return/);
  assert.match(page, /fetch\('\/api\/store\/whatsapp\/product-request'/);
  assert.match(modal, /isWhatsAppRequestPending/);
  assert.match(modal, /disabled=.*isWhatsAppRequestPending/);
  assert.doesNotMatch(page, /buildWhatsAppOrderMessage|openWhatsAppWithMessage/);
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
