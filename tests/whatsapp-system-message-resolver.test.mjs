import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const contract = await compile('../src/lib/whatsapp/variable-contract.ts');
const registry = await compile('../src/lib/whatsapp/template-registry.ts');
const engine = await compile('../src/lib/whatsapp/template-engine.ts', { './variable-contract': contract });
const derived = await compile('../src/lib/whatsapp/derived-values.ts');
const identity = await compile('../src/lib/whatsapp/context-identity.ts');

const finance = {
  calculateOrderBalance(order, transactions) {
    const confirmed = transactions
      .filter((item) => item.type === 'receita' && item.status === 'pago')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return Math.max(0, Number(order.total_amount) - Math.max(Number(order.paid_amount || 0), confirmed));
  }
};

const entityResolver = {
  createSupabaseWhatsAppEntityDataSource() { throw new Error('not used'); },
  createStoreProductPricingContext(request) {
    return { pricingConfig: { quantity: Number(request.quantity || 1) }, selectedOptionsPresent: false };
  },
  async resolveWhatsAppCustomerVariables(context, source) {
    const customer = await source.getCustomer(context.trustedCompanyId, context.customerId);
    if (!customer) throw new Error('WHATSAPP_ENTITY_RESOLUTION_CUSTOMER_NOT_FOUND');
    if (customer.id !== context.customerId || customer.company_id !== context.trustedCompanyId) {
      throw new Error('WHATSAPP_ENTITY_RESOLUTION_TENANT_MISMATCH');
    }
    return { variables: {
      'cliente.nome': customer.name,
      'cliente.whatsapp': customer.phone,
      cliente_nome: customer.name,
      cliente_telefone: customer.phone
    }, missing: [], metadataSanitized: {} };
  },
  async resolveWhatsAppProductVariables(context, source) {
    const product = await source.getProduct(context.trustedCompanyId, context.productId);
    if (!product || product.company_id !== context.trustedCompanyId) throw new Error('WHATSAPP_ENTITY_RESOLUTION_PRODUCT_NOT_FOUND');
    return { variables: {
      'produto.nome': product.name,
      'produto.tipo_venda': product.pricing_type,
      'produto.preco': 'R$ 20,00',
      produto_nome: product.name,
      tipo_venda: product.pricing_type
    }, missing: [], metadataSanitized: {} };
  }
};

const companyResolver = {
  createSupabaseWhatsAppVariableDataSource() { throw new Error('not used'); },
  async resolveWhatsAppCompanyVariables(context, source) {
    const row = source.values;
    if (context.companyId !== context.trustedCompanyId || row.companyId !== context.trustedCompanyId) {
      throw new Error('WHATSAPP_VARIABLE_RESOLUTION_TENANT_MISMATCH');
    }
    return {
      variables: { ...row.variables },
      missing: [],
      metadataSanitized: { effectiveBusinessPhone: row.businessPhone || '', queryCounts: {} }
    };
  }
};

const storeResolver = {
  resolveStoreProductRequestVariables(request, context) {
    return {
      ...context.productVariables,
      empresa_nome: context.companyName,
      produto_nome: context.product.name,
      tipo_venda: context.product.pricing_type,
      quantidade: Number(request.quantity || 1),
      medidas: '', metragem: '', opcoes: '', prazo: '', valor_total: context.productVariables['produto.preco'] || '',
      cliente_nome: String(request.customerName || ''), cliente_telefone: String(request.customerPhone || ''), observacoes: String(request.notes || '')
    };
  }
};

const resolver = await compile('../src/lib/whatsapp/system-message-resolver.server.ts', {
  '@/lib/finance-rules': finance,
  '@/lib/order-number': { formatOrderDisplayNumber: (value) => `PED-${value}` },
  '@/lib/pricing': { formatCurrency: (value) => `R$ ${Number(value).toFixed(2).replace('.', ',')}` },
  '@/lib/store/whatsapp-product-request': storeResolver,
  '@/lib/supabase/server-admin': { getSupabaseAdminClient() { throw new Error('not used'); } },
  '@/lib/utils': {
    getWhatsAppTimeGreeting: () => 'Bom dia',
    getPixWhatsAppPaymentInfo: ({ key, beneficiaryName, bankName }) => ({
      label: 'PIX sintético', value: `PAYLOAD:${key}`, securityText: `Favorecido: ${beneficiaryName}\nBanco: ${bankName}`
    })
  },
  './customer-product-variable-resolver.server': entityResolver,
  './derived-values': derived,
  './template-engine': engine,
  './template-registry': registry,
  './variable-resolver.server': companyResolver
});

const customers = [
  { id: 'customer-1', company_id: 'tenant-a', name: 'Cliente Mesmo Nome', phone: '5511111111111' },
  { id: 'customer-2', company_id: 'tenant-a', name: 'Cliente Mesmo Nome', phone: '5522222222222' },
  { id: 'customer-b', company_id: 'tenant-b', name: 'Cliente B', phone: '5533333333333' }
];

const baseCompanySource = {
  values: {
    companyId: 'tenant-a',
    businessPhone: '5544444444444',
    variables: {
      'empresa.nome': 'Empresa A', empresa_nome: 'Empresa A',
      'empresa.pix_chave': 'pix.synthetic@example.test',
      'empresa.pix_tipo': 'email',
      'empresa.pix_titular': 'Empresa A',
      'empresa.banco': 'Banco Sintético',
      chave_pix: 'pix.synthetic@example.test'
    }
  }
};

const baseRows = {
  quote: { id: 'quote-a', company_id: 'tenant-a', customer_id: 'customer-2', number: 18, total_amount: 253.2, valid_until: '2026-08-30' },
  order: { id: 'order-a', company_id: 'tenant-a', customer_id: 'customer-2', customer_name: 'Cliente Mesmo Nome', number: '17', status: 'producao', payment_status: 'parcial', total_amount: 100, paid_amount: 10, created_at: '2026-08-01' },
  production: { id: 'production-a', company_id: 'tenant-a', order_id: 'order-a', order_number: '17', product_name: 'Produto A', status: 'concluido' },
  product: { id: 'product-a', company_id: 'tenant-a', name: 'Produto A', pricing_type: 'unidade' }
};

function dependencies(overrides = {}) {
  const rows = { ...baseRows, ...(overrides.rows || {}) };
  const template = overrides.template === undefined ? null : overrides.template;
  return {
    companyDataSource: overrides.companyDataSource || baseCompanySource,
    entityDataSource: {
      async getCustomer(companyId, customerId) {
        return customers.find((item) => item.company_id === companyId && item.id === customerId) || null;
      },
      async getProduct(companyId, productId) {
        return rows.product?.company_id === companyId && rows.product.id === productId ? rows.product : null;
      },
      async getCategory() { return null; }
    },
    dataSource: {
      async getQuote() { return rows.quote || null; },
      async getOrder() { return rows.order || null; },
      async getProductionItem() { return rows.production || null; },
      async getFinancialTransactions() { return overrides.transactions || [{ id: 'pay-1', company_id: 'tenant-a', order_id: 'order-a', type: 'receita', status: 'pago', amount: 40 }]; },
      async getTemplate() { return template; },
      async getWhatsAppSettings() { return overrides.whatsappSettings || null; }
    },
    now: new Date('2026-08-16T09:00:00-03:00')
  };
}

test('context contract contains exactly four discriminated system events', () => {
  assert.deepEqual(contract.WHATSAPP_EVENT_KEYS, ['quote_proposal', 'order_payment_pending', 'production_status_changed', 'store_product_request']);
  assert.equal(contract.WHATSAPP_EVENT_KEYS.length, 4);
});

test('exact tenant identity selects the referenced homonym and never falls back by name', () => {
  const selected = identity.findExactTenantCustomer(customers, 'customer-2', 'tenant-a');
  assert.equal(selected?.phone, '5522222222222');
  assert.notEqual(selected?.id, 'customer-1');
  assert.equal(identity.findExactTenantCustomer(customers, '', 'tenant-a'), null);
  assert.equal(identity.findExactTenantCustomer(customers, 'missing', 'tenant-a'), null);
  assert.equal(identity.findExactTenantCustomer(customers, 'customer-b', 'tenant-a'), null);
});

test('quote resolver uses quote customer_id, real values and registry fallback', async () => {
  const result = await resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a' } }, dependencies());
  assert.equal(result.recipient, '5522222222222');
  assert.equal(result.variables.cliente_nome, 'Cliente Mesmo Nome');
  assert.equal(result.variables.orcamento_codigo, '18');
  assert.equal(result.variables.validade_orcamento, '30/08/2026');
  assert.equal(result.metadata.templateSource, 'registry');
  assert.match(result.renderedContent, /Cliente Mesmo Nome/);
});

test('missing or invalid customer_id blocks contextual resolution', async () => {
  await assert.rejects(
    resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a' } }, dependencies({ rows: { quote: { ...baseRows.quote, customer_id: null } } })),
    /CUSTOMER_ID_MISSING/
  );
  await assert.rejects(
    resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'order_payment_pending', orderId: 'order-a' } }, dependencies({ rows: { order: { ...baseRows.order, customer_id: 'missing' } } })),
    /CUSTOMER_NOT_FOUND/
  );
});

test('cross-tenant contextual rows fail closed without returning tenant B data', async () => {
  await assert.rejects(
    resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a' } }, dependencies({ rows: { quote: { ...baseRows.quote, company_id: 'tenant-b' } } })),
    /TENANT_MISMATCH/
  );
});

test('order resolver uses confirmed partial payments and synthetic real PIX settings', async () => {
  const result = await resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'order_payment_pending', orderId: 'order-a' } }, dependencies());
  assert.equal(result.recipient, '5522222222222');
  assert.equal(result.variables.saldo_pendente, 'R$ 60,00');
  assert.equal(result.variables.chave_pix, 'PAYLOAD:pix.synthetic@example.test');
  assert.doesNotMatch(JSON.stringify(result.metadata), /pix\.synthetic|552222|Cliente Mesmo Nome/);
});

test('missing real PIX blocks payment and never uses registry or demo samples', async () => {
  const noPix = { values: { ...baseCompanySource.values, variables: { 'empresa.nome': 'Empresa A', empresa_nome: 'Empresa A' } } };
  await assert.rejects(
    resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'order_payment_pending', orderId: 'order-a' } }, dependencies({ companyDataSource: noPix })),
    /PIX_NOT_CONFIGURED/
  );
  const source = await readFile(new URL('../src/app/(dashboard)/orders/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /financeiro@printflowpro\.com\.br|financeiro@empresa\.com\.br/);
  assert.match(source, /loadWhatsAppPaymentSettings\(company\.id\)/);
});

test('production resolver derives status from production_queue and resolves order/customer by ID', async () => {
  const result = await resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'production_status_changed', productionItemId: 'production-a' } }, dependencies());
  assert.equal(result.variables.status_pedido, 'Concluído (Pronto para Retirada/Entrega)');
  assert.equal(result.variables.pedido_codigo, 'PED-17');
  assert.equal(result.recipient, '5522222222222');
});

test('tenant template override and default registry fallback are both preserved', async () => {
  const overridden = await resolver.resolveSystemWhatsAppMessage(
    { trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a' } },
    dependencies({ template: { content: 'Override {{orcamento_codigo}}', active: false } })
  );
  assert.equal(overridden.renderedContent, 'Override 18');
  assert.equal(overridden.active, false);
  assert.equal(overridden.metadata.templateSource, 'override');

  const fallback = await resolver.resolveSystemWhatsAppMessage(
    { trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a' } },
    dependencies()
  );
  assert.match(fallback.renderedContent, /Segue a proposta\/orçamento/);
});

test('store context remains supported without changing the current Store runtime', async () => {
  const result = await resolver.resolveSystemWhatsAppMessage({
    trustedCompanyId: 'tenant-a',
    context: { eventKey: 'store_product_request', productId: 'product-a', request: { quantity: 2, customerName: 'Cliente Store' } }
  }, dependencies());
  assert.equal(result.variables.produto_nome, 'Produto A');
  assert.equal(result.variables.quantidade, '2');
  assert.equal(result.recipient, '5544444444444');
});

test('runtime context validation rejects mixed or extra entity identifiers', async () => {
  await assert.rejects(
    resolver.resolveSystemWhatsAppMessage({ trustedCompanyId: 'tenant-a', context: { eventKey: 'quote_proposal', quoteId: 'quote-a', orderId: 'order-a' } }, dependencies()),
    /INVALID_CONTEXT/
  );
});

test('Supabase contextual datasource uses explicit id and company_id filters', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/system-message-resolver.server.ts', import.meta.url), 'utf8');
  for (const table of ['quotes', 'orders', 'production_queue']) {
    assert.match(source, new RegExp(`from\\('${table}'\\)[\\s\\S]{0,260}\\.eq\\('id',[\\s\\S]{0,80}\\.eq\\('company_id', companyId\\)`));
  }
  assert.doesNotMatch(source, /customers\[0\]|orders\[0\]|quotes\[0\]|production\[0\]|customer\.name\s*===/);
});
